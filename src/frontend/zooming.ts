/* global document */

function sanitizeFactor(factor) {
  let result = factor;
  if (result < 0) {
    result *= -1;
  }
  if (result === 0) {
    result += 1.1;
  }
  if (result < 1) {
    result = 1 / result;
  }
  return result;
}

const attachClick = function (id: string, f) {
  const el = document.getElementById(id);
  if (el) el.onclick = f;
};

exports.attachZoomButtons = function (
  textareaID,
  zoominID,
  resetID,
  zoomoutID,
  inputFactorOrDefault
) {
  const inputFactor =
    typeof inputFactorOrDefault === "undefined" ? 1.1 : inputFactorOrDefault;
  const sizes = {
    factor: 1.1,
    currentSize: 1.0,
  };
  const textarea = document.getElementById(textareaID);
  function applySize() {
    const sizePercent = Math.round(sizes.currentSize * 100);
    textarea.style.fontSize = sizePercent.toString() + "%";
  }

  const zoomin = function () {
    sizes.currentSize *= sizes.factor;
    console.log("zoom: " + sizes.currentSize);
    applySize();
  };

  const zoomout = function () {
    sizes.currentSize /= sizes.factor;
    console.log("zoom: " + sizes.currentSize);
    applySize();
  };

  const reset = function () {
    sizes.currentSize = 1.0;
    console.log("zoom: " + sizes.currentSize);
    applySize();
  };

  sizes.factor = sanitizeFactor(inputFactor);

  attachClick(zoominID, zoomin);
  attachClick(zoomoutID, zoomout);
  attachClick(resetID, reset);
};
