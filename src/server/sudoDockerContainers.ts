import { Instance } from "./instance";
import { InstanceManager } from "./instanceManager";

import childProcess = require("child_process");
const exec = childProcess.exec;

const logger = require("./logger");

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

  // experimental: scan existing dockers
  public recoverInstances(next) {
    const self = this;
    const dockerPsCmd = "sudo docker ps -q";
    const existing = {};
    exec(dockerPsCmd, function (error, stdout, stderr) {
      const lst = stdout.split("\n");

      const asyncLoop = function (i) {
        if (i == 0) {
          next(existing);
          return;
        }
        i--;
        if (lst[i] != "") {
          const dockerInspectCmd = "sudo docker inspect " + lst[i];
          exec(dockerInspectCmd, function (error, stdout, stderr) {
            const res = JSON.parse(stdout);
            const clientId = res[0].Config.Labels.clientId;
            if (clientId) {
              // find port
              const port = res[0].NetworkSettings.Ports["22/tcp"][0].HostPort;
              logger.info(
                "Scanning " + lst[i] + " found " + clientId + ":" + port
              );
              const newInstance = JSON.parse(
                JSON.stringify(self.currentInstance)
              ); // eww
              newInstance.port = port;
              newInstance.clientId = clientId;
              newInstance.lastActiveTime = Date.now();
              newInstance.containerName = "m2Port" + newInstance.port;
              if (!existing[clientId]) {
                logger.info("Recovering");
                // test for sshd?
                existing[clientId] = newInstance;
                self.addInstanceToArray(newInstance);
              } else {
                self.removeInstance(newInstance);
              }
            }
            asyncLoop(i);
          });
        } else asyncLoop(i);
      };
      asyncLoop(lst.length);
    });
  }

  public getNewInstance(clientId, next) {
    const self = this;
    if (this.currentContainers.length >= this.hostConfig.maxContainerNumber) {
      this.killOldestContainer(function () {
        self.getNewInstance(clientId, next);
      });
    } else {
      const newInstance = JSON.parse(JSON.stringify(self.currentInstance));
      self.currentInstance.port++;
      newInstance.containerName = "m2Port" + newInstance.port;
      newInstance.clientId = clientId;
      newInstance.lastActiveTime = Date.now();
      exec(
        self.constructDockerRunCommand(self.resources, newInstance),
        function (error) {
          if (error) {
            const containerAlreadyStarted =
              error.message.match(/Conflict. The name/) ||
              error.message.match(/Conflict. The container name/);
            if (containerAlreadyStarted) {
              self.getNewInstance(clientId, next);
            } else {
              logger.error(
                "Error starting the docker container: " + error.message
              );
              throw error;
            }
          } else {
            self.addInstanceToArray(newInstance);
            self.waitForSshd(next, newInstance);
          }
        }
      );
    }
  }
  public updateLastActiveTime(instance: Instance) {
    instance.lastActiveTime = Date.now();
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
    this.currentContainers.sort(function (a, b) {
      return a.lastActiveTime - b.lastActiveTime;
    });
  };

  private killOldestContainer = function (next) {
    const self = this;
    self.sortInstancesByAge();
    if (self.isLegal(self.currentContainers[0])) {
      self.removeInstance(self.currentContainers[0], next);
    } else {
      throw new Error("Too many active users.");
    }
  };

  private removeInstance(instance: Instance, next?) {
    const self = this;
    logger.info("Removing container: " + instance.containerName);
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
      self.removeInstanceFromArray(instance);
      if (next) {
        next();
      }
    });
  }

  private constructDockerRunCommand(resources, newInstance: Instance) {
    let dockerRunCmd = "sudo docker run -d";
    dockerRunCmd += ' --cpus="' + resources.cpuShares + '"';
    dockerRunCmd += ' --memory="' + resources.memory + 'm"';
    dockerRunCmd += " --name " + newInstance.containerName;
    dockerRunCmd += " -p " + newInstance.port + ":22";
    dockerRunCmd += " -l " + "clientId=" + newInstance.clientId;
    dockerRunCmd +=
      " " + this.hostConfig.containerType + " " + this.hostConfig.sshdCmd;
    logger.info("Running " + dockerRunCmd);
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
          logger.info("sshd is ready.");
          next(null, instance);
        } else {
          logger.info("sshd not ready yet.");
          self.waitForSshd(next, instance);
        }
      }
    );
  }
}

export { SudoDockerContainersInstanceManager as SudoDockerContainers };
