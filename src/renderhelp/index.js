const fs = require("fs");
const path = require("path");
// where original help files are taken
const sourcePath =
  "/home/pzinn/M2/M2/BUILD/fedora/usr-dist/common/share/doc/Macaulay2/";
// where they're written
const targetPath = "/usr/share/doc/Macaulay2/";
// browser
const browserPath = "/usr/bin/google-chrome";
// time we wait before giving up
const timeout = 60000 // 60 secs

let overwrite = false;
let verbose = false;
let skip = false;
let fileList = [];
for (let i = 2; i < process.argv.length; i++)
  if (process.argv[i].startsWith("--")) {
    if (process.argv[i] == "--overwrite") overwrite = true;
    // whether to overwrite existing files even if newer
    else if (process.argv[i] == "--verbose") verbose = true;
    else if (process.argv[i] == "--skip") skip = true; // whether to try again failed ones
    else if (process.argv[i] == "--test") { overwrite=true; verbose=true; fileList.push("Macaulay2Doc/html/_determinant.html"); }
    else if (process.argv[i] == "--test2") { overwrite=true; verbose=true; fileList.push("GraphicalModels/html/_hidden__Map.html"); }
  } else fileList.push(process.argv[i]);

const walk = function (dir, prefix) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function (file) {
    const stat = fs.statSync(dir + "/" + file);
    if (stat && stat.isDirectory()) {
      /* Recurse into a subdirectory */
      results = results.concat(walk(dir + "/" + file, prefix + file + "/"));
    } else {
      /* Is a file */
      results.push(prefix + file);
    }
  });
  return results;
};

if (fileList.length == 0) fileList = walk(sourcePath, "");
console.log(fileList.length + " files to process...");

const head = fs.readFileSync("src/renderhelp/head.html").toString();

(async () => {
  const puppeteer = require("puppeteer-core");
  let browser = await puppeteer.launch({
    executablePath: browserPath,
  });
  let page;

  for (filename of fileList) {
    if (
      filename.substr(-5) == ".html" &&
      fs.existsSync(sourcePath + filename) &&
      (overwrite ||
        !fs.existsSync(targetPath + filename) ||
        fs.statSync(targetPath + filename).mtime.getTime() <=
          fs.statSync(sourcePath + filename).mtime.getTime()) &&
      (!skip || !fs.existsSync(sourcePath + filename + "_render_error"))
    ) {
      console.log(filename);
      let content =
        '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN"><html><head>' + head;
      if (filename.startsWith("VectorGraphics"))
        content += '<script src="/VectorGraphics.js"></script>';
      content +=
        `</head><body onload='renderhelp("` +
        fs.readFileSync(sourcePath + filename, "base64") +
        `");'></body></html>`;
      try {
        page = await browser.newPage();
        page.setDefaultNavigationTimeout(timeout);
      } catch (e) {
        console.log("cant get new page -- " + e);
      }
      if (verbose) {
        page.on("console", (msg) => console.log("page log:", msg.text()));
        page.on("pageerror", (msg) =>
          console.log("page error: \u001b[31m", msg, "\u001b[0m")
        );
      }
      try {
        await page.setContent(content);
        fs.mkdirSync(path.dirname(targetPath + filename), { recursive: true });
        fs.writeFileSync(targetPath + filename, await page.content()); // serialized HTML of page DOM.
        if (fs.existsSync(sourcePath + filename + "_render_error"))
          fs.unlinkSync(sourcePath + filename + "_render_error");
      } catch (e) {
        console.log("giving up on this one -- " + e);
        fs.writeFileSync(sourcePath + filename + "_render_error", "");
      }
      try {
        await page.close();
      } catch (e) {
        console.log("restarting browser -- " + e);
        browser = await puppeteer.launch({
          executablePath: "/usr/bin/google-chrome",
        });
      }
    }
  }
  await browser.close();
})();
