import { Instance, InstanceManager } from "./instance";
import fs = require("fs");

import childProcess = require("child_process");
const exec = childProcess.exec;

import { Client, userSpecificPath } from "./client";
import { clients, staticFolder } from "./server";
import { logger } from "./logger";

const save = "save.tar.gz";

class SudoDockerContainersInstanceManager implements InstanceManager {
  private resources: any;
  private hostConfig: any;
  private currentInstance: any;
  private currentContainers: any[];

  constructor(resources: any, options: any, currentInstance: Instance) {
    this.resources = resources;
    this.hostConfig = options;
    this.currentInstance = currentInstance;
    const currentContainers = [];
    this.currentContainers = currentContainers;
  }

  private incrementPort() {
    this.currentInstance.port =
      this.currentInstance.port == 65535
        ? this.hostConfig.instancePort
        : this.currentInstance.port + 1;
  }

  // scan existing dockers
  public recoverInstances(recreate: boolean, next) {
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
              if (recreate) {
                self.getNewInstance(clientId, function (newInstance: Instance) {
                  if (clients[clientId]) {
                    if (clients[clientId].instance)
                      self.removeInstance(clients[clientId].instance);
                  } else clients[clientId] = new Client(clientId);
                  clients[clientId].instance = newInstance;
                  exec(
                    "sudo docker cp " +
                      lst[i] +
                      ":/home/" +
                      newInstance.username +
                      " /tmp",
                    function () {
                      exec("sudo docker rm -f " + lst[i], function () {
                        exec(
                          "sudo docker cp /tmp/" +
                            newInstance.username +
                            " " +
                            newInstance.containerName +
                            ":/home",
                          function () {
                            exec(
                              "sudo docker exec " +
                                newInstance.containerName +
                                " chown -R " +
                                newInstance.username +
                                ":" +
                                newInstance.username +
                                " /home/" +
                                newInstance.username,
                              function () {
                                exec(
                                  "sudo rm -rf /tmp/" + newInstance.username,
                                  function () {
                                    asyncLoop(i);
                                  }
                                );
                              }
                            );
                          }
                        );
                      });
                    }
                  );
                });
              } else {
                // find port
                const port =
                  +res[0].NetworkSettings.Ports["22/tcp"][0].HostPort;
                const newInstance = JSON.parse(
                  JSON.stringify(self.currentInstance)
                ); // eww
                // test for sshd?
                newInstance.port = port;
                if (self.currentInstance.port < port)
                  self.currentInstance.port = port;
                newInstance.clientId = clientId;
                newInstance.lastActiveTime = Date.now();
                newInstance.numInputs = 0;
                newInstance.containerName = "m2Port" + newInstance.port;
                if (clients[clientId]) {
                  if (clients[clientId].instance)
                    self.removeInstance(clients[clientId].instance);
                } else clients[clientId] = new Client(clientId);
                clients[clientId].instance = newInstance;
                self.addInstanceToArray(newInstance);
                asyncLoop(i);
              }
            } else asyncLoop(i);
          });
        } else asyncLoop(i);
      };
      asyncLoop(lst.length);
    });
  }

  public getNewInstance(clientId, next) {
    const self = this;
    if (self.currentContainers.length >= self.hostConfig.maxContainerNumber)
      self.killOldestContainer(); // no waiting for it
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
                  // cleanup: TODO reactivate
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
                self.waitForSshd(next, instance);
              });
            } else self.waitForSshd(next, instance);
          });
        }
      }
    );
  }

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
      a.numInputs == 0 && b.numInputs > 0
        ? -1
        : b.numInputs == 0 && a.numInputs > 0
        ? 1
        : a.lastActiveTime - b.lastActiveTime
    );
  };

  private killOldestContainer = function () {
    const self = this;
    self.sortInstancesByAge();
    const instance = self.currentContainers[0];
    if (self.isLegal(instance)) {
      self.removeInstance(instance);
    } else {
      throw new Error("Too many active users.");
    }
  };

  public removeInstanceFromId = function (clientId: string) {
    if (clients[clientId] && clients[clientId].instance)
      this.removeInstance(clients[clientId].instance);
  };

  private removeInstance(instance: Instance) {
    const self = this;
    logger.info("Removing container: " + instance.containerName);
    self.removeInstanceFromArray(instance); // do this first to avoid trying to remove the same container multiple times

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
        ' tar --exclude "./.*" -C /home/' +
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
        // then remove docker
        const removeDockerContainer =
          "sudo docker rm -f " + instance.containerName;
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
      });
    });
  }

  private constructDockerRunCommand(resources, newInstance: Instance) {
    let dockerRunCmd =
      "sudo docker run  --security-opt seccomp=seccomp.json -d";
    dockerRunCmd += ' --cpus="' + resources.cpuShares + '"';
    dockerRunCmd += ' --memory="' + resources.memory + 'm"';
    dockerRunCmd += " --name " + newInstance.containerName;
    dockerRunCmd += " -p " + newInstance.port + ":22";
    dockerRunCmd += " -l " + "clientId=" + newInstance.clientId;
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
        }
        const runningSshDaemons = stdout;

        logger.info("Looking for sshd. OUT: " + stdout + " ERR: " + stderr);

        if (runningSshDaemons) {
          logger.info("sshd is ready");
          next(instance);
        } else {
          logger.info("sshd not ready yet");
          self.waitForSshd(next, instance);
        }
      }
    );
  }
}

const options = {
  serverConfig: {
    MATH_PROGRAM_COMMAND:
      "stty -echo; LD_PRELOAD=/usr/lib64/libtagstderr.so M2MODE=sudoDocker M2 --webapp",
    CONTAINERS(resources, hostConfig, guestInstance): InstanceManager {
      return new SudoDockerContainersInstanceManager(
        resources,
        hostConfig,
        guestInstance
      );
    },
  },
};

export { options };
