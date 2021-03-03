import { Instance } from "./instance";
import { InstanceManager } from "./instanceManager";

import childProcess = require("child_process");
const exec = childProcess.exec;

import { Client } from "./client";
import { clients } from "./server";
import { logger } from "./logger";

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
              newInstance.port = port;
              if (self.currentInstance.port < port)
                self.currentInstance.port = port;
              newInstance.clientId = clientId;
              newInstance.lastActiveTime = Date.now() - 1000 * 3600 * 24 * 365; // not really active => 1 year handicap
              newInstance.containerName = "m2Port" + newInstance.port;
              if (!clients[clientId]) {
                logger.info("Recovering");
                // test for sshd?
                const client = new Client(clientId);
                clients[clientId] = client;
                client.instance = newInstance;
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
    if (self.currentContainers.length >= self.hostConfig.maxContainerNumber) {
      self.killOldestContainer(function () {
        self.getNewInstance(clientId, next);
      });
    } else {
      const newInstance = JSON.parse(JSON.stringify(self.currentInstance));
      self.incrementPort();
      newInstance.containerName = "m2Port" + newInstance.port;
      newInstance.clientId = clientId;
      newInstance.lastActiveTime = Date.now();
      exec(
        self.constructDockerRunCommand(self.resources, newInstance),
        function (error) {
          if (error) {
            const containerAlreadyStarted =
              error.message.match(/Conflict. The name/) ||
              error.message.match(/Conflict. The container name/); // weak TODO
            if (containerAlreadyStarted) {
              self.getNewInstance(clientId, next);
            } else {
              logger.error(
                "Error starting the docker container: " + error.message
              );
              throw error;
            }
          } else {
            logger.info(
              "Docker container " +
                newInstance.containerName +
                " created for " +
                newInstance.clientId
            );
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
      clients[instance.clientId].instance = null;
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
