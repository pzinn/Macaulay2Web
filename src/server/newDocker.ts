import {
  Instance,
  InstanceCallback,
  InstanceManager,
  InstanceRemovalCallback,
} from "./instance";

import { Client, userSpecificPath } from "./client";
import {
  clients,
  staticFolder,
  options as serverOptions,
  notifyExpectedMathProgramStop,
} from "./server";
import { logger } from "./logger";
import { InstanceCreationQueue } from "./instanceCreationQueue";
import {
  DockerManagerDependencies,
  defaultDockerManagerDependencies,
} from "./dockerManagerDependencies";
import { isDockerContainerMissingError } from "./dockerArchive";

const saveFile = "save.tar.gz";
const retryDelay = 3000;

class NewDockerContainersInstanceManager implements InstanceManager {
  private resources: any;
  private hostConfig: any;
  private currentInstance: any;
  private currentContainers: any[];
  private pendingCreations: InstanceCreationQueue;
  private dependencies: DockerManagerDependencies;

  constructor(
    resources: any,
    hostConfig: any,
    currentInstance: Instance,
    dependencies: DockerManagerDependencies = defaultDockerManagerDependencies
  ) {
    this.resources = resources;
    this.hostConfig = hostConfig;
    this.currentInstance = currentInstance;
    const currentContainers = [];
    this.currentContainers = currentContainers;
    this.pendingCreations = new InstanceCreationQueue();
    this.dependencies = dependencies;
  }

  private dockerName(clientId: string) {
    return "m2Client." + clientId;
  }

  private getIpFromInspect(res): string {
    const networks = res[0].NetworkSettings.Networks;
    if (networks)
      for (const networkName in networks) {
        if (networks[networkName].IPAddress)
          return networks[networkName].IPAddress;
      }
    return res[0].NetworkSettings.IPAddress;
  }

  private getContainerIp(containerName: string, next) {
    const dockerInspectCmd = "sudo docker inspect " + containerName;
    this.dependencies.exec(
      dockerInspectCmd,
      function (error, stdout, stderr) {
        if (error) {
          logger.error(
            "Error inspecting container " + containerName + ": " + error
          );
          return next(error);
        }
        const res = JSON.parse(stdout);
        const ip = this.getIpFromInspect(res);
        if (!ip) {
          const msg = "No Docker bridge IP found for " + containerName;
          logger.error(msg);
          return next(new Error(msg));
        }
        next(null, ip);
      }.bind(this)
    );
  }

  // scan existing dockers
  public recoverInstances(next) {
    const self = this;
    const dockerPsCmd = "sudo docker ps -q";
    self.dependencies.exec(dockerPsCmd, function (error, stdout, stderr) {
      const lst = stdout.split("\n");

      const asyncLoop = function (i) {
        if (i == 0) {
          next();
          return;
        }
        i--;
        if (lst[i] != "") {
          const dockerInspectCmd = "sudo docker inspect " + lst[i];
          self.dependencies.exec(
            dockerInspectCmd,
            function (error, stdout, stderr) {
              if (error) {
                logger.error(
                  "Error inspecting container " + lst[i] + ": " + error
                );
                asyncLoop(i);
                return;
              }
              const res = JSON.parse(stdout);
              const clientId =
                res[0].Config.Labels && res[0].Config.Labels.clientId;
              if (clientId) {
                logger.info(
                  "Scanning " + lst[i] + " found " + clientId + res[0].Name
                );
                const ip = self.getIpFromInspect(res);
                if (!ip) {
                  logger.error("No Docker bridge IP found for " + res[0].Name);
                  asyncLoop(i);
                  return;
                }
                const newInstance = JSON.parse(
                  JSON.stringify(self.currentInstance)
                ); // eww
                // test for sshd?
                newInstance.host = ip;
                newInstance.port = 22;
                newInstance.clientId = clientId;
                newInstance.lastActiveTime =
                  Date.now() - self.hostConfig.minContainerAge; // now Date.now() to avoid nasty bug where new users can't be created for 10 mins after reboot
                newInstance.numInputs = 0;
                newInstance.containerName = res[0].Name.replace(/^\//, "");
                if (clients[clientId]) {
                  if (clients[clientId].instance)
                    self.removeInstance(clients[clientId].instance);
                } else clients[clientId] = new Client(clientId);
                clients[clientId].instance = newInstance;
                self.addInstanceToArray(newInstance);
              }
              asyncLoop(i);
            }
          );
        } else asyncLoop(i);
      };
      asyncLoop(lst.length);
    });
  }

  public getNewInstance(clientId: string, next: InstanceCallback) {
    if (!this.pendingCreations.request(clientId, next)) {
      logger.info("Joining pending container creation for " + clientId);
      return;
    }
    this.createNewInstance(clientId);
  }

  private createNewInstance(clientId: string) {
    const self = this;
    self.ensureCapacity(function (capacityError) {
      if (capacityError) {
        logger.error(
          "Unable to free capacity for " + clientId + ": " + capacityError
        );
        self.retryInstanceCreation(clientId);
        return;
      }

      const instance = JSON.parse(JSON.stringify(self.currentInstance));
      instance.containerName = self.dockerName(clientId);
      instance.clientId = clientId;
      instance.port = 22;
      instance.lastActiveTime = Date.now();
      instance.numInputs = 0;
      self.dependencies.exec(
        self.constructDockerRunCommand(self.resources, instance),
        function (error) {
          if (error) {
            logger.error(
              "Error starting the docker container: " + error.message
            );
            self.retryInstanceCreation(clientId);
            return;
          }

          logger.info(
            "Docker container " +
              instance.containerName +
              " created for " +
              clientId
          );
          self.addInstanceToArray(instance);
          self.getContainerIp(instance.containerName, function (ipError, ip) {
            if (ipError) {
              self.removeFailedStartupAndRetry(instance);
              return;
            }
            instance.host = ip;
            logger.info(
              "Docker container " +
                instance.containerName +
                " has bridge IP " +
                ip
            );
            self.restoreFiles(instance, function () {
              self.dependencies.waitForDockerSshd(
                instance,
                self.hostConfig.sshdCmd,
                function (readinessError) {
                  if (readinessError) {
                    logger.error(String(readinessError));
                    self.removeFailedStartupAndRetry(instance);
                    return;
                  }
                  self.completeInstanceCreation(instance);
                }
              );
            });
          });
        }
      );
    });
  }

  private retryInstanceCreation(clientId: string) {
    const self = this;
    setTimeout(function () {
      if (self.pendingCreations.has(clientId)) self.createNewInstance(clientId);
    }, retryDelay);
  }

  private completeInstanceCreation(instance: Instance) {
    this.pendingCreations.complete(instance);
  }

  private restoreFiles(instance: Instance, next: () => void) {
    const savePath =
      staticFolder + userSpecificPath(instance.clientId) + saveFile;
    this.dependencies.access(savePath, (err) => {
      if (err) {
        next();
        return;
      }
      logger.info("Restoring files for " + instance.clientId);
      const restoreDockerContainer =
        "sudo docker exec -i " +
        instance.containerName +
        " tar -C /home/" +
        instance.username +
        " -xzf - . < " +
        savePath;
      this.dependencies.exec(restoreDockerContainer, function (error) {
        if (error)
          logger.error(
            "Error restoring files for container " +
              instance.containerName +
              " with error:" +
              error
          );
        else logger.info("Restored files for " + instance.clientId);
        next();
      });
    });
  }

  private removeFailedStartupAndRetry(instance: Instance) {
    const self = this;
    self.removeInstance(
      instance,
      false,
      function (removalError) {
        if (removalError) {
          logger.error(
            "Unable to remove failed container " +
              instance.containerName +
              "; retrying removal: " +
              removalError
          );
          setTimeout(
            () => self.removeFailedStartupAndRetry(instance),
            retryDelay
          );
          return;
        }
        self.retryInstanceCreation(instance.clientId);
      },
      false
    );
  }

  public checkInstance = function (instance: Instance, next) {
    this.dependencies.exec(
      "sudo docker inspect m2container --format='{{.Id}}'",
      (imageError, imageId) => {
        if (imageError) {
          logger.error("Unable to inspect current Docker image: " + imageError);
          next(false);
          return;
        }
        this.dependencies.exec(
          "sudo docker inspect " +
            instance.containerName +
            " --format='{{.Image}}'",
          function (containerError, containerImageId) {
            if (containerError) {
              logger.error(
                "Unable to inspect container " +
                  instance.containerName +
                  ": " +
                  containerError
              );
              next(false);
              return;
            }
            next(imageId.trim() !== containerImageId.trim());
          }
        );
      }
    );
  };

  private removeInstanceFromArray = function (instance: Instance) {
    const position = this.currentContainers.indexOf(instance);
    if (position >= 0) this.currentContainers.splice(position, 1);
  };

  private addInstanceToArray = function (instance: Instance) {
    if (this.currentContainers.indexOf(instance) < 0)
      this.currentContainers.push(instance);
  };

  private isLegal = function (instance: Instance) {
    const age = Date.now() - instance.lastActiveTime;
    return age > this.hostConfig.minContainerAge;
  };

  private sortInstancesByAge = function () {
    this.currentContainers.sort((a, b) =>
      a.numInputs == 0 && this.isLegal(a) && b.numInputs > 0
        ? -1
        : b.numInputs == 0 && this.isLegal(b) && a.numInputs > 0
        ? 1
        : a.lastActiveTime - b.lastActiveTime
    );
  };

  private ensureCapacity(next: InstanceRemovalCallback) {
    const num =
      1 + this.currentContainers.length - this.hostConfig.maxContainerNumber;
    if (num <= 0) {
      next();
      return;
    }

    logger.info("Too many containers (" + num + ")");
    this.sortInstancesByAge();
    const instances = this.currentContainers.slice(0, num);
    if (
      instances.length < num ||
      instances.some((instance) => !this.isLegal(instance))
    ) {
      next(new Error("Too many active users."));
      return;
    }

    let remaining = instances.length;
    let firstError: Error;
    instances.forEach((instance) =>
      this.removeInstance(instance, true, function (error) {
        if (error && !firstError) firstError = error;
        remaining--;
        if (remaining === 0) next(firstError);
      })
    );
  }

  public removeInstanceFromId = function (
    clientId: string,
    next: InstanceRemovalCallback = () => {}
  ) {
    if (clients[clientId] && clients[clientId].instance)
      this.removeInstance(clients[clientId].instance, false, next);
    else next();
  };

  private finishRemoval(instance: Instance, error?: Error) {
    instance.removalInProgress = false;
    if (error) this.addInstanceToArray(instance);
    else if (
      clients[instance.clientId] &&
      clients[instance.clientId].instance === instance
    )
      clients[instance.clientId].instance = null;

    const callbacks = instance.removalCallbacks || [];
    instance.removalCallbacks = [];
    callbacks.forEach((callback) => callback(error));
  }

  private removeInstanceInternal(instance: Instance) {
    // actual removing docker
    const self = this;
    const removeDockerContainer = "sudo docker rm -f " + instance.containerName;
    self.dependencies.exec(removeDockerContainer, function (error) {
      if (isDockerContainerMissingError(error)) {
        logger.info("Container already absent: " + instance.containerName);
        self.finishRemoval(instance);
        return;
      }
      if (error) {
        logger.error(
          "Error removing container " +
            instance.containerName +
            " with error:" +
            error
        );
      }
      self.finishRemoval(
        instance,
        error instanceof Error
          ? error
          : error
          ? new Error(String(error))
          : undefined
      );
    });
  }

  private removeInstance(
    instance: Instance,
    notifyClient = false,
    next: InstanceRemovalCallback = () => {},
    saveFiles = true
  ) {
    const self = this;
    if (!instance.removalCallbacks) instance.removalCallbacks = [];
    instance.removalCallbacks.push(next);
    if (instance.removalInProgress) {
      logger.warn(
        "Container removal already in progress: " + instance.containerName
      );
      return;
    }
    instance.removalInProgress = true;
    logger.info("Removing container: " + instance.containerName);
    if (notifyClient && clients[instance.clientId]) {
      notifyExpectedMathProgramStop(
        clients[instance.clientId],
        "Macaulay2 was stopped by the server to free resources. Press Reset to start a fresh process."
      );
    }
    self.removeInstanceFromArray(instance); // do this first to avoid trying to remove the same container multiple times

    if (!saveFiles) {
      self.removeInstanceInternal(instance);
      return;
    }

    const savePath =
      staticFolder + userSpecificPath(instance.clientId) + saveFile;
    self.dependencies.archiveDockerHome(instance, savePath, function (error) {
      if (error) {
        if (isDockerContainerMissingError(error)) {
          logger.info(
            "Container already absent; retaining previous saved files for " +
              instance.clientId
          );
          self.finishRemoval(instance);
          return;
        }
        logger.error(
          "Error saving container " +
            instance.containerName +
            "; container was not removed: " +
            error
        );
        self.finishRemoval(instance, error);
        return;
      }
      self.removeInstanceInternal(instance);
    });
  }

  private constructDockerRunCommand(resources, newInstance: Instance) {
    const premium =
      serverOptions.premiumList.indexOf(newInstance.clientId) >= 0;
    let dockerRunCmd =
      "sudo docker run  --security-opt seccomp=seccomp.json -d";
    dockerRunCmd += " --log-opt max-size=10m --log-opt max-file=3";
    dockerRunCmd += ' --cpus="' + resources.cpuShares + '"';
    dockerRunCmd +=
      ' --memory="' +
      (premium ? 2 * resources.memory : resources.memory) +
      'm"';
    dockerRunCmd += " --name " + newInstance.containerName;
    dockerRunCmd += " -l " + "clientId=" + newInstance.clientId;
    dockerRunCmd +=
      " -v " + staticFolder + "tutorials:/home/m2user/tutorials:ro";
    dockerRunCmd +=
      " " + this.hostConfig.containerType + " " + this.hostConfig.sshdCmd;
    //    logger.info("Running " + dockerRunCmd);
    return dockerRunCmd;
  }
}

const options = {
  manager: NewDockerContainersInstanceManager,
};

export { options, NewDockerContainersInstanceManager };
