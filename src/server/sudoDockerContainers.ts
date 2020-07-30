import { Instance } from "./instance";
import { InstanceManager } from "./instanceManager";

import childProcess = require("child_process");
const exec = childProcess.exec;

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

  public getNewInstance(next) {
    const self = this;
    if (this.currentContainers.length >= this.hostConfig.maxContainerNumber) {
      this.killOldestContainer(function () {
        self.getNewInstance(next);
      });
    } else {
      const newInstance = JSON.parse(JSON.stringify(self.currentInstance));
      self.currentInstance.port++;
      newInstance.containerName = "m2Port" + newInstance.port;
      exec(
        self.constructDockerRunCommand(self.resources, newInstance),
        function (error) {
          if (error) {
            const containerAlreadyStarted =
              error.message.match(/Conflict. The name/) ||
              error.message.match(/Conflict. The container name/);
            if (containerAlreadyStarted) {
              self.getNewInstance(next);
            } else {
              console.error(
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
    this.currentContainers.splice(position, 1);
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

  private removeInstance(instance: Instance, next) {
    const self = this;
    console.log("Removing container: " + instance.containerName);
    const removeDockerContainer = "sudo docker rm -f " + instance.containerName;
    exec(removeDockerContainer, function (error) {
      if (error) {
        console.error(
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
    dockerRunCmd += " -p " + newInstance.port + ":22 ";
    dockerRunCmd +=
      this.hostConfig.containerType + " " + this.hostConfig.sshdCmd;
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
          console.error("Error while waiting for sshd: " + error);
        }
        const runningSshDaemons = stdout;

        console.log("Looking for sshd. OUT: " + stdout + " ERR: " + stderr);

        if (runningSshDaemons) {
          console.log("sshd is ready.");
          next(null, instance);
        } else {
          console.log("sshd not ready yet.");
          self.waitForSshd(next, instance);
        }
      }
    );
  }
}

export { SudoDockerContainersInstanceManager as SudoDockerContainers };
