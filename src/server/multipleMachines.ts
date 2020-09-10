/* eslint "no-unused-vars": "off" */
const logger = require("./logger");
const multiMachineManager = function () {
  const Machine = function () {
    this.name = "";
    this.containerManager = "";
    this.config = null;
    this.maxContainerNumber = 1;
    this.currentContainerNumber = 0;
    this.load = 0;
    this.updateLoad = function () {
      if (this.maxContainerNumber === 0) {
        logger.info(
          "Why are you even considering " + "machines that don't allow users?"
        );
        this.load = 1;
      } else {
        this.load = this.currentContainerNumber / this.maxContainerNumber;
      }
    };
    this.init = function (
      name,
      containerManagerFile,
      config,
      maxContainerNumber
    ) {
      this.name = name;
      this.containerManager = require(containerManagerFile)(config);
      this.config = config;
      this.maxContainerNumber = maxContainerNumber;
      this.getNewInstance = function (userId, next) {
        this.containerManager.getNewInstance(userId, function (err, instance) {
          if (err) {
            next(err);
          } else {
            this.currentContainerNumber++;
            this.updateLoad();
            instance.machine = this;
            next(instance);
          }
        });
      };
      this.removeInstance = function (instance, next) {
        this.containerManager.removeInstance(instance, function () {
          this.currentContainerNumber--;
          this.updateLoad();
          if (next) {
            next();
          }
        });
      };
      this.updateLastActiveTime = function (instance) {
        this.containerManager.updateLastActiveTime(instance);
      };
    };
  };

  const machines = [];

  const updateLastActiveTime = function (instance) {
    instance.machine.updateLastActiveTime(instance);
  };

  const getNewInstance = function (userId, next) {
    machines.sort(function (a, b) {
      return a.load - b.load;
    });
    machines[0].getNewInstance(userId, next);
  };

  const removeInstance = function (instance, next) {
    instance.machine.removeInstance(instance, next);
  };

  return {
    updateLastActiveTime,
    getNewInstance,
    removeInstance,
  };
};
