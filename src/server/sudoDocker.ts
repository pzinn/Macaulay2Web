import { Instance, InstanceManager } from "./instance";
import fs = require("fs");

import childProcess = require("child_process");
const exec = childProcess.exec;

import { Client, userSpecificPath } from "./client";
import { clients, staticFolder, options as serverOptions } from "./server";
import { logger } from "./logger";

const save = "save.tar.gz";

class SudoDockerContainersInstanceManager implements InstanceManager {
  private resources: any;
  private hostConfig: any;
  private currentInstance: any;
  private currentContainers: any[];
  private startPort: number;

  constructor(resources: any, hostConfig: any, currentInstance: Instance) {
    this.resources = resources;
    this.hostConfig = hostConfig;
    this.currentInstance = currentInstance;
    const currentContainers = [];
    this.currentContainers = currentContainers;
    this.startPort = currentInstance.port;
  }

  private incrementPort() {
    this.currentInstance.port =
      this.currentInstance.port == 65535
        ? this.startPort
        : this.currentInstance.port + 1;
  }

  // scan existing dockers
  public recoverInstances(next) {
    const self = this;
    const dockerPsCmd = "sudo docker ps -q";
    exec(dockerPsCmd, function (error, stdout, stderr) {
      const lst = stdout.split("\n");

      const asyncLoop = function (i) {
        if (i == 0) {
          self.incrementPort();
          next();
          return;
        }
        i--;
        if (lst[i] != "") {
          const dockerInspectCmd = "sudo docker inspect " + lst[i];
          exec(dockerInspectCmd, function (error, stdout, stderr) {
            const res = JSON.parse(stdout);
            const clientId = res[0].Config.Labels.clientId;
            if (clientId) {
              logger.info(
                "Scanning " + lst[i] + " found " + clientId + res[0].Name
              );
              // find port
              const port = +res[0].NetworkSettings.Ports["22/tcp"][0].HostPort;
              const newInstance = JSON.parse(
                JSON.stringify(self.currentInstance)
              ); // eww
              // test for sshd?
              newInstance.port = port;
              if (self.currentInstance.port < port)
                self.currentInstance.port = port;
              newInstance.clientId = clientId;
              newInstance.lastActiveTime =
                Date.now() - self.hostConfig.minContainerAge; // now Date.now() to avoid nasty bug where new users can't be created for 10 mins after reboot
              newInstance.numInputs = 0;
              newInstance.containerName = "m2Port" + newInstance.port;
              if (clients[clientId]) {
                if (clients[clientId].instance)
                  self.removeInstance(clients[clientId].instance);
              } else clients[clientId] = new Client(clientId);
              clients[clientId].instance = newInstance;
              self.addInstanceToArray(newInstance);
            }
            asyncLoop(i);
          });
        } else asyncLoop(i);
      };
      asyncLoop(lst.length);
    });
  }

  public getNewInstance(clientId: string, next) {
    const self = this;
    if (self.currentContainers.length >= self.hostConfig.maxContainerNumber)
      self.killOldestContainers(
        1 + self.currentContainers.length - self.hostConfig.maxContainerNumber
      ); // no waiting for it
    const instance = JSON.parse(JSON.stringify(self.currentInstance));
    self.incrementPort();
    instance.containerName = "m2Port" + instance.port;
    instance.clientId = clientId;
    instance.lastActiveTime = Date.now();
    instance.numInputs = 0;
    exec(
      self.constructDockerRunCommand(self.resources, instance),
      function (error) {
        if (error) {
          logger.error("Error starting the docker container: " + error.message);
          setTimeout(function () {
            self.getNewInstance(clientId, next);
          }, 3000);
        } else {
          logger.info(
            "Docker container " +
              instance.containerName +
              " created for " +
              clientId
          );
          self.addInstanceToArray(instance);
          // check for saved files
          const savePath = staticFolder + userSpecificPath(clientId);
          const saveFile = savePath + save;
          fs.access(saveFile, function (err) {
            if (!err) {
              logger.info("Restoring files for " + clientId);
              const restoreDockerContainer =
                "sudo docker exec -i " +
                instance.containerName +
                " tar -C /home/" +
                instance.username +
                " -xzf - . < " +
                saveFile;
              exec(restoreDockerContainer, function (error) {
                if (error) {
                  logger.error(
                    "Error restoring files for container " +
                      instance.containerName +
                      " with error:" +
                      error
                  );
                } else {
                  // cleanup
                  /*
                  fs.rm(
                    savePath,
                    { recursive: true, force: true },
                    function (err) {
                      if (err) {
                        logger.warn(
                          "Unable to delete user directory " +
                            savePath +
                            " : " +
                            err
                        );
                      }
                    }
                  );
		    */
                }
              });
            }
            self.waitForSshd(next, instance); // don't wait for restore in case it hangs
          });
        }
      }
    );
  }

  public checkInstance = function (instance: Instance, next) {
    exec(
      "diff <(sudo docker inspect m2container --format='{{.Id}}') <(sudo docker inspect " +
        instance.containerName +
        " --format='{{.Image}}')",
      next
    );
  };

  private removeInstanceFromArray = function (instance: Instance) {
    const position = this.currentContainers.indexOf(instance);
    if (position >= 0) this.currentContainers.splice(position, 1);
  };

  private addInstanceToArray = function (instance: Instance) {
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

  private killOldestContainers = function (num: number) {
    logger.info("Too many containers (" + num + ")");
    this.sortInstancesByAge();
    for (let i = 0; i < num && this.currentContainers.length > 0; i++) {
      const instance = this.currentContainers[0];
      if (this.isLegal(instance)) this.removeInstance(instance);
      else throw new Error("Too many active users.");
    }
  };

  public removeInstanceFromId = function (clientId: string) {
    if (clients[clientId] && clients[clientId].instance)
      this.removeInstance(clients[clientId].instance);
  };

  private removeInstanceInternal(instance: Instance) {
    // actual removing docker
    const removeDockerContainer = "sudo docker rm -f " + instance.containerName;
    exec(removeDockerContainer, function (error) {
      if (error) {
        logger.error(
          "Error removing container " +
            instance.containerName +
            " with error:" +
            error
        );
      }
      clients[instance.clientId].instance = null;
    });
  }

  private removeInstance(instance: Instance) {
    const self = this;
    logger.info("Removing container: " + instance.containerName);
    self.removeInstanceFromArray(instance); // do this first to avoid trying to remove the same container multiple times

    if (instance.numInputs == 0) self.removeInstanceInternal(instance);
    else {
      // first, save files
      const savePath = staticFolder + userSpecificPath(instance.clientId);
      fs.mkdir(savePath, function (fsError) {
        if (fsError) {
          if (fsError.code !== "EEXIST")
            logger.error("Error creating directory: " + savePath);
        }
        const saveFile = savePath + save;
        const saveDockerContainer =
          "rm -f " +
          saveFile +
          "; sudo docker exec " +
          instance.containerName +
          ' tar --exclude "./.*" --exclude "./tutorials" -C /home/' +
          instance.username +
          " -czf - . > " +
          saveFile;
        exec(saveDockerContainer, function (error) {
          if (error) {
            logger.error(
              "Error saving container " +
                instance.containerName +
                " with error:" +
                error
            );
          }
          self.removeInstanceInternal(instance);
        });
      });
    }
  }

  private constructDockerRunCommand(resources, newInstance: Instance) {
    const premium =
      serverOptions.premiumList.indexOf(newInstance.clientId) >= 0;
    let dockerRunCmd =
      "sudo docker run  --security-opt seccomp=seccomp.json -d";
    dockerRunCmd += ' --cpus="' + resources.cpuShares + '"';
    dockerRunCmd +=
      ' --memory="' +
      (premium ? 2 * resources.memory : resources.memory) +
      'm"';
    dockerRunCmd += " --name " + newInstance.containerName;
    dockerRunCmd += " -p " + newInstance.port + ":22";
    dockerRunCmd += " -l " + "clientId=" + newInstance.clientId;
    dockerRunCmd += " -v `pwd`/public/tutorials:/home/m2user/tutorials:ro";
    dockerRunCmd +=
      " " + this.hostConfig.containerType + " " + this.hostConfig.sshdCmd;
    //    logger.info("Running " + dockerRunCmd);
    return dockerRunCmd;
  }

  private waitForSshd(next, instance: Instance) {
    const dockerRunningProcesses =
      "sudo docker exec " + instance.containerName + " ps aux";
    const filterForSshd = 'grep "' + this.hostConfig.sshdCmd + '"';
    const excludeGrep = "grep -v grep";

    const self = this;
    exec(
      dockerRunningProcesses + " | " + filterForSshd + " | " + excludeGrep,
      function (error, stdout, stderr) {
        if (error) {
          logger.error("Error while waiting for sshd: " + error);
          setTimeout(function () {
            self.getNewInstance(instance.clientId, next); // what if instance is still running?
          }, 3000);
          return;
        }
        const runningSshDaemons = stdout;

        logger.info("Looking for sshd. OUT: " + stdout + " ERR: " + stderr);

        if (runningSshDaemons) {
          logger.info("sshd is ready");
          next(instance);
        } else {
          logger.info("sshd not ready yet");
          setTimeout(function () {
            self.waitForSshd(next, instance);
          }, 3000);
        }
      }
    );
  }
}

const options = {
  manager: SudoDockerContainersInstanceManager,
};

export { options };
