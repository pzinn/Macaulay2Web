/* global fetch */
module.exports = function (callback, extra) {
  console.log("Fetch tutorials.");
  fetch("/getListOfTutorials", {
    credentials: "same-origin",
  })
    .then(function (data) {
      return data.json();
    })
    .then(function (tutorialPaths) {
      console.log("Obtaining list of tutorials successful: " + tutorialPaths);
      if (extra) tutorialPaths.unshift(extra);
      callback(tutorialPaths);
    })
    .catch(function (error) {
      console.log(
        "There was an error obtaining the list of " + "tutorial files: " + error
      );
    });
};
