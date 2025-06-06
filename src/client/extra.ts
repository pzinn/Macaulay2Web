import Cookie from "cookie";
import { options } from "../common/global";
import { socket, url, myshell, clientId } from "./main";
import {
  scrollDown,
  setCaret,
  setCaretAtEndMaybe,
  getCaret,
  getCaret2,
  caretIsAtEnd,
  nextChar,
  selectRowColumn,
  addMarkerEl,
  parseLocation,
} from "./htmlTools";
import { socketChat, syncChat } from "./chat";
import { initTutorials, renderLessonMaybe } from "./tutorials";
import { Chat } from "../common/chatClass";
import {
  escapeKeyHandling,
  autoCompleteHandling,
  removeAutoComplete,
  delimiterHandling,
  autoIndent,
  syntaxHighlight,
  updateAndHighlightMaybe,
} from "./editor";

const hashCode = function (s: string) {
  let hash = 0,
    i,
    chr;
  if (s.length === 0) return hash;
  for (i = 0; i < s.length; i++) {
    chr = s.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
};

const setCookie = function (name: string, value: string): void {
  const expDate = new Date(new Date().getTime() + options.cookieDuration);
  document.cookie = Cookie.serialize(name, value, {
    expires: expDate,
  });
};

const getCookie = function (name, deflt?) {
  const cookies = Cookie.parse(document.cookie);
  const cookie = cookies[name];
  return cookie ? cookie : deflt;
};

const getCookieId = function () {
  return getCookie(options.cookieName);
};

const setCookieId = function (): void {
  setCookie(options.cookieName, clientId);
};

/*
const unsetCookie = function (name: string): void {
  document.cookie = Cookie.serialize(name, "", {
    expires: new Date(0),
    path: "/",
  });
};
*/

const emitReset = function () {
  myshell.reset();
  socket.emit("reset");
};

const attachClick = function (id: string, f) {
  const el = document.getElementById(id);
  if (el) el.onclick = f;
};

let fileName;
const updateFileName = function (newName: string) {
  const fileNameEl = document.getElementById(
    "editorFileName"
  ) as HTMLInputElement;
  fileNameEl.value = newName;
  fileNameEl.scrollLeft = fileNameEl.scrollWidth;
  // update list of past names
  if (fileName && newName == fileName) return;
  const pastFileNames = document.getElementById(
    "pastFileNames"
  ) as HTMLSelectElement;
  let flag = true;
  Array.from(pastFileNames.options).forEach(function (opt: HTMLOptionElement) {
    if (fileName && opt.textContent == fileName) flag = false;
    else if (opt.textContent == newName) pastFileNames.removeChild(opt);
  });
  if (fileName && flag) {
    const opt = document.createElement("option");
    opt.textContent = fileName;
    document.getElementById("pastFileNames").appendChild(opt);
  }
  // update current name
  fileName = newName;
  setCookie(options.cookieFileName, fileName);
};

let currentFileIsDirectory;
let currentFileIsReadonly;
let editor; // "editorDiv"

const setDirectory = function (val: boolean) {
  currentFileIsDirectory = val;
  editor.contentEditable = !val; // auto convert to string
};

const setReadonly = function (val: boolean, msg?: string) {
  currentFileIsReadonly = val;
  const btn = document.getElementById("warningBtn");
  const tooltip = document.getElementById("warningBtn-tooltip");
  if (btn) btn.style.display = val ? "" : "none";
  if (tooltip) tooltip.textContent = msg;
};

let autoSaveTimeout;
let autoSaveHash;
const autoSave = function (e?, callback?, rush?) {
  //    console.log("TEST autoSave: ",e,callback,rush,autoSaveHash); console.trace();
  if (autoSaveTimeout) {
    window.clearTimeout(autoSaveTimeout);
    autoSaveTimeout = 0;
  }

  if (!fileName || currentFileIsReadonly) {
    if (callback) callback();
    return;
  }
  // the autoSaveHash === undefined is important -- sometimes autoSave gets called too early, *after* fileName has been set but *before* file has been loaded / hash computed
  if (autoSaveHash === undefined) {
    console.log("failed autoSave -- will try again");
    autoSaveTimeout = setTimeout(() => {
      autoSave(e, callback, rush);
    }, 100); // we don't call back yet
    return;
  }
  const content = editor.textContent as string;
  const newHash = hashCode(content);
  //    console.log("hash: ",newHash," vs ",autoSaveHash);
  if (newHash != autoSaveHash) {
    console.log("Saving " + fileName);
    const file = new File([content], fileName);
    const formData = new FormData();
    formData.append("files[]", file);
    formData.append("id", clientId);
    formData.append("noreply", "true");
    autoSaveHash = newHash;
    formData.append("hash", autoSaveHash);
    if (rush !== true) {
      const req = new XMLHttpRequest();
      req.open("POST", "/upload");
      //req.onloadend = showUploadDialog;
      req.send(formData);
    } else navigator.sendBeacon("/upload", formData);
  }
  if (callback) callback();
};

let highlightTimeout = 0;

const fileChangedCheck = function (data) {
  if (!fileName || data.fileName != fileName || data.hash == autoSaveHash)
    return;
  const dialog = document.getElementById("editorFileChanged") as any; //HTMLDialogElement;
  if (dialog.open)
    // already open -- we're in trouble
    return; // ???
  if (!dialog.showModal) {
    socket.emit("fileexists", fileName, function (response) {
      if (response) localFileToEditor(response);
    });
    return;
  }
  dialog.style.display = ""; // turned off for safari etc that don't support Dialog
  document.getElementById("changedFileName").textContent = fileName;
  dialog.onclose = function () {
    if (dialog.returnValue == "overwrite") {
      autoSaveHash = null; // force save
      autoSave();
    } else
      socket.emit("fileexists", fileName, function (response) {
        if (response) localFileToEditor(response);
      });
  };
  dialog.showModal();
};

const localFileToEditor = function (fileName: string, rowcols?) {
  if (highlightTimeout) window.clearTimeout(highlightTimeout);
  const xhr = new XMLHttpRequest();
  xhr.open("GET", fileName, true);
  xhr.onload = function () {
    updateAndHighlightMaybe(editor, xhr.responseText, fileName);
    setDirectory(false);
    autoSaveHash = hashCode(xhr.responseText);
    if (rowcols) selectRowColumn(editor, rowcols);
    else editor.scrollTop = 0;
  };
  autoSaveHash = undefined; // no autosaving while loading
  xhr.send(null);
};

const listDirToEditor = function (dirName: string, fileName: string) {
  setReadonly(true, "No syncing - directory");
  if (!dirName.endsWith("/")) dirName += "/";
  if (highlightTimeout) window.clearTimeout(highlightTimeout);
  const xhr = new XMLHttpRequest();
  xhr.open("GET", fileName, true);
  xhr.onload = function () {
    setDirectory(true);
    const lst = xhr.responseText
      .split("\n")
      .sort()
      .map((s) => [dirName + s, s]);
    if (dirName != "./") {
      // a bit crude
      const i = dirName.lastIndexOf("/", dirName.length - 2);
      const ancestor = i >= 0 ? dirName.substring(0, i + 1) : "./";
      lst.unshift([
        ancestor,
        "<i class='material-icons'>subdirectory_arrow_left</i>",
      ]);
    }
    editor.innerHTML =
      "<ul style='list-style:none'>" +
      lst
        .map((a) => "<li><a href='#editor:" + a[0] + "'>" + a[1] + "</a></li>")
        .join("") +
      "</ul>";
  };
  autoSaveHash = undefined; // no autosaving for directories
  xhr.send(null);
};

const newEditorFileMaybe = function (newName: string, rowcols?, missing?) {
  // missing = what to do if file missing : undefined/false = switch to new, true = do nothing
  if (!rowcols) editor.focus({ preventScroll: true });

  if ((fileName && fileName == newName && fileName != "./") || !newName) {
    // file already open in editor
    updateFileName(newName); // in case of positioning data
    if (rowcols) selectRowColumn(editor, rowcols);
    return;
  }

  socket.emit("fileexists", newName, function (response) {
    if (!response) {
      if (missing) return;
      updateFileName(newName);
      if (currentFileIsDirectory) editor.innerHTML = "";
      setDirectory(false);
      setReadonly(newName == "", "No syncing - empty filename"); // TODO determine correctly if read only or not -- how?
      if (rowcols) selectRowColumn(editor, rowcols);
      autoSaveHash = null; // force save
      autoSave();
      return;
    } else console.log(response + " succesfully loaded");
    autoSave(null, function () {
      // saving old file <- important! can't fail! so we use callback
      updateFileName(newName);
      if (response.search("directory@") >= 0)
        listDirToEditor(newName, response);
      // eww
      else {
        setReadonly(
          response.search("readonly@") >= 0,
          "No syncing - read only file"
        );
        localFileToEditor(response, rowcols);
      }
    });
  });
};

let checkScrollButton = function () {}; // will be defined later
let openTutorialInEditor = function (txt, fileName) {}; // will be defined later

const extra1 = function () {
  const tabs = document.getElementById("tabs") as any;
  const iFrame = document.getElementById("browseFrame") as HTMLIFrameElement;
  editor = document.getElementById("editorDiv");

  let tab = url.hash;
  initTutorials();

  let oldTab = "";
  let editorFoc = false;
  // supersedes mdl's internal tab handling
  const openTab = function () {
    let loc = document.location.hash.substring(1);
    if (editorFoc) {
      if (loc == "editor") editor.focus(); // hacky -- editor keeps losing focus
      editorFoc = false;
      return;
    }
    // new syntax for navigating tutorial
    const m = /^tutorial(?:-(\w+))?(?:-(\d+))?$/.exec(loc);
    if (m) {
      const r = renderLessonMaybe(m[1], m[2]);
      document.location.hash = "#tutorial-" + r[0] + "-" + r[1]; // add the tuto name / # to URL
      loc = "tutorial";
    } else if (document.fullscreenElement !== null) document.exitFullscreen();
    // editor stuff
    const e = /^editor:(.+)$/.exec(loc);
    if (e) {
      const [newName, rowcols] = parseLocation(decodeURI(e[1]));
      if (newName == "stdio" || newName == "currentString") {
        if (newName == "stdio" && rowcols && socket && socket.connected)
          myshell.selectPastInput(document.activeElement, rowcols); // !
        document.location.hash = "#" + oldTab;
        loc = "";
      } else {
        if (socket && socket.connected)
          newEditorFileMaybe(newName, rowcols, true); // do something *if* session started
        document.location.hash = "#editor"; // drop the filename from the URL (needed for subsequent clicks)
        loc = "editor";
        editorFoc = true; // ... but changing hash blurs editor
      }
    }
    const panel = document.getElementById(loc);
    if (panel) {
      oldTab = loc;
      const tab = document.getElementById(loc + "Title");
      if (tab) {
        if (tabs.MaterialTabs) {
          tabs.MaterialTabs.resetPanelState_();
          tabs.MaterialTabs.resetTabState_();
        }
        panel.classList.add("is-active");
        tab.classList.add("is-active");
        if (loc == "chat") {
          tab.removeAttribute("data-message");
          // scroll. sadly, doesn't work if started with #chat
          const ul = document.getElementById("chatMessages");
          scrollDown(ul);
        }
      }
    } else document.location.hash = "#" + oldTab; // should this be there?
  };

  let ignoreFirstLoad = true;
  const openBrowseTab = function (event) {
    const el = document.getElementById("browseTitle");
    // show tab panel
    if (el && tabs.classList.contains("is-upgraded")) {
      if (ignoreFirstLoad) ignoreFirstLoad = false;
      else el.click();
    }
    // try to enable actions
    if (iFrame && iFrame.contentDocument && iFrame.contentDocument.body) {
      const bdy = iFrame.contentDocument.body;
      bdy.onclick = document.body.onclick;
      bdy.onkeydown = document.body.onkeydown;
      bdy.onmousedown = document.body.onmousedown;
      bdy.oncontextmenu = document.body.oncontextmenu;
    }
    // do not follow link
    event.preventDefault();
  };

  if (tab === "") tab = "#home";
  window.addEventListener("hashchange", openTab);
  if (tab === document.location.hash) openTab();
  // force open tab anyway
  else document.location.hash = tab;

  iFrame.onload = openBrowseTab;

  // resize
  const resize = document.getElementById("resize");
  let ismdwn = 0;
  const resizeMouseDown = () => {
    ismdwn = 1;
    document.body.addEventListener("mousemove", resizeMouseMove);
    document.body.addEventListener("mouseup", resizeMouseEnd);
    document.body.addEventListener("mouseleave", resizeMouseEnd);
    if (iFrame && iFrame.contentDocument && iFrame.contentDocument.body)
      iFrame.contentDocument.body.addEventListener(
        "mousemove",
        resizeMouseMove
      );
    document.body.style.userSelect = "none";
  };

  const resizeMouseMove = (event) => {
    if (ismdwn === 1)
      (document.getElementById("left-half") as any).style.flexBasis =
        event.clientX - 24 + "px";
    // 24 is left-padding+left-margin+right-margin
    else resizeMouseEnd();
  };

  const resizeMouseEnd = () => {
    ismdwn = 0;
    document.body.removeEventListener("mousemove", resizeMouseMove);
    document.body.removeEventListener("mouseup", resizeMouseEnd);
    document.body.removeEventListener("mouseleave", resizeMouseEnd);
    if (iFrame && iFrame.contentDocument && iFrame.contentDocument.body)
      iFrame.contentDocument.body.removeEventListener(
        "mousemove",
        resizeMouseMove
      );
    document.body.style.userSelect = "";
    checkScrollButton();
  };

  resize.onmousedown = resizeMouseDown;

  const resizeTouchStart = () => {
    document.body.addEventListener("touchmove", resizeTouchMove);
    document.body.addEventListener("touchend", resizeTouchEnd);
    document.body.addEventListener("touchcancel", resizeTouchEnd);
    document.body.style.userSelect = "none";
  };

  const resizeTouchMove = (event) => {
    (document.getElementById("left-half") as any).style.flexBasis =
      event.changedTouches[0].clientX - 24 + "px";
    // 24 is left-padding+left-margin+right-margin
  };

  const resizeTouchEnd = () => {
    document.body.removeEventListener("touchmove", resizeTouchMove);
    document.body.removeEventListener("touchend", resizeTouchEnd);
    document.body.removeEventListener("touchcancel", resizeTouchEnd);
    document.body.style.userSelect = "";
    checkScrollButton();
  };

  resize.ontouchstart = resizeTouchStart;
};

// 2nd part: once session active
const extra2 = function () {
  const terminal = document.getElementById("terminal");
  const terminalDiv = document.getElementById("terminalDiv");
  const chatForm = document.getElementById("chatForm");

  let evaluateMarker = null;

  const editorEvaluateOut = function () {
    if (evaluateMarker) {
      evaluateMarker.remove();
      evaluateMarker = null;
    }
  };

  const editorEvaluateHover = function () {
    editorEvaluateOut();
    if (currentFileIsDirectory) return;
    const sel = window.getSelection();
    if (sel.isCollapsed) {
      const caret = getCaret(editor);
      if (caret === null) return;
      const txt = editor.textContent;
      let start = caret - 1,
        end = caret;
      while (end < txt.length && txt[end] != "\n") end++;
      while (start >= 0 && txt[start] != "\n") start--;
      start++;
      evaluateMarker = addMarkerEl(editor, start, true);
      evaluateMarker.classList.add("valid-marker");
      evaluateMarker.dataset.content =
        start == end ? "▒" : txt.substring(start, end).replace(/[\S ]/g, "▒");
    }
  };

  const editorEvaluate = function (e?) {
    // similar to trigger the paste event (except for when there's no selection and final \n) (which one can't manually, see below)
    //    const sel = window.getSelection() as any; // modify is still "experimental"
    if (currentFileIsDirectory) return;
    const sel = window.getSelection();
    if (editor.contains(sel.focusNode)) {
      // only if we're inside the editor
      let s;
      if (sel.isCollapsed) {
        /*
        sel.modify("move", "backward", "lineboundary");
        sel.modify("extend", "forward", "lineboundary");
	*/
        sel.modify("move", "forward", "lineboundary"); // semi-fix for annoying move/backward/lineboundary bug when line empty
        sel.modify("extend", "backward", "lineboundary");

        s = sel.toString();
        // sel.modify("move", "forward", "line"); // doesn't work in firefox
        sel.collapseToEnd();
        sel.modify("move", "forward", "character");
        // giving up on using .modify since chromium devs can't be bothered fixing a trivial bug https://bugs.chromium.org/p/chromium/issues/detail?id=1221539#c3
        // actually, has been fixed, reinstated
        /*
        const caret = getCaret(editor);
        const txt = editor.textContent;
        let start = caret - 1,
          end = caret;
        while (end < txt.length && txt[end] != "\n") end++;
        while (start >= 0 && txt[start] != "\n") start--;
        s = txt.substring(start + 1, end);
        if (end < txt.length) end++;
        setCaret(editor, end, end, true).scrollIntoView({
          block: "nearest",
          inline: "nearest",
          });
	 */
      } else s = sel.toString(); // fragInnerText(sel.getRangeAt(0).cloneContents()); // toString used to fail because ignored BR / DIV which firefox creates
      myshell.postMessage(s);
      // important not to move the pointer so can move to next line
      // s.split("\n").forEach((line) => myshell.postMessage(line)); // should work fine now that echo mode is on but not needed
      if (e) editorEvaluateHover();
      editor.focus(); // in chrome, this.blur() would be enough, but not in firefox
    }
  };

  const editorEvaluateAll = function () {
    myshell.postMessage(editor.textContent);
    editor.focus();
  };

  const clearOut = function () {
    const curInput = document.getElementsByClassName(
      "M2CurrentInput"
    )[0] as HTMLElement;
    Array.from(terminal.querySelectorAll(".M2Cell")).forEach((x) => {
      if (!x.contains(curInput)) x.remove();
    });
  };

  const fileNameEl = document.getElementById(
    "editorFileName"
  ) as HTMLInputElement;

  fileNameEl.onblur = function () {
    // prevents annoying default behavior on scrolling back to start
    setTimeout(function () {
      fileNameEl.scrollLeft = fileNameEl.scrollWidth;
    }, 0);
  };
  fileNameEl.onchange = function () {
    const val = fileNameEl.value.trim();
    const [newName, rowcols] = parseLocation(val);
    newEditorFileMaybe(newName, rowcols);
  };
  const pastFileNames = document.getElementById(
    "pastFileNames"
  ) as HTMLSelectElement;
  pastFileNames.onfocus = function () {
    pastFileNames.selectedIndex = -1;
  }; // dirty trick found on the internet...
  pastFileNames.onchange = function () {
    const newName = pastFileNames.options[pastFileNames.selectedIndex].text;
    newEditorFileMaybe(newName);
  };

  const homeEditorBtn = document.getElementById("homeEditorBtn");
  homeEditorBtn.onclick = function () {
    autoSave(null, function () {
      // can't fail! so we use callback
      turnOffSearchMode();
      newEditorFileMaybe("./");
    });
  };

  const clearEditorBtn = document.getElementById("clearEditorBtn");
  clearEditorBtn.onclick = function () {
    autoSave(null, function () {
      // can't fail! so we use callback
      turnOffSearchMode();
      editor.innerHTML = "";
      setDirectory(false);
      setReadonly(true, "No syncing - empty filename");
      updateFileName("");
      fileNameEl.focus();
    });
  };

  const copyFileNameBtn = document.getElementById("copyFileNameBtn");
  copyFileNameBtn.onclick = function () {
    const fileNameEl = document.getElementById(
      "editorFileName"
    ) as HTMLInputElement;
    const curInput = document.getElementsByClassName(
      "M2CurrentInput"
    )[0] as HTMLElement;
    if (curInput) {
      setCaretAtEndMaybe(curInput);
      document.execCommand("insertText", false, '"' + fileNameEl.value + '"');
    }
  };

  const showUploadDialog = function (event) {
    console.log("file upload returned status code " + event.target.status);
    const response = event.target.responseText;
    if (response) {
      const dialog = document.getElementById("uploadDialog") as any; //HTMLDialogElement;
      if (dialog.showModal) {
        document.getElementById("uploadSuccessText").innerHTML = response;
        dialog.style.display = ""; // turned off for safari etc that don't support Dialog
        //        dialog.showModal();
      }
    }
  };

  const fileUploadInput = document.getElementById(
    "localUpload"
  ) as HTMLInputElement;

  const uploadFile = function () {
    const dialog = document.getElementById("uploadDialog") as any; //HTMLDialogElement;
    if (dialog.showModal) {
      dialog.style.display = ""; // turned off for safari etc that don't support Dialog
      dialog.showModal();
    } else {
      // for browsers that don't support dialog, just revert to local upload
      fileUploadInput.click();
    }
  };

  const uploadFileProcess = function (event) {
    const files = event.target.files;
    if (files.length > 0) {
      const req = new XMLHttpRequest();
      const formData = new FormData();
      for (let i = 0; i < files.length; i++)
        formData.append("files[]", files[i]);
      formData.append("id", clientId);
      req.onloadend = showUploadDialog;
      req.open("POST", "/upload");
      req.send(formData);
    }
    fileUploadInput.value = ""; // to allow reuploading
  };

  fileUploadInput.addEventListener("change", uploadFileProcess, false);

  const githubUpload = document.getElementById("githubUpload") as HTMLElement;
  const githubUser = document.getElementById("githubUser") as HTMLInputElement;
  const githubProject = document.getElementById(
    "githubProject"
  ) as HTMLInputElement;
  const githubBranch = document.getElementById(
    "githubBranch"
  ) as HTMLInputElement;
  githubUpload.onclick = function () {
    if (!githubUser.value) return;
    if (!githubProject.value) return;
    if (!githubBranch.value) return; // default?
    const req = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("githubUser", githubUser.value);
    formData.append("githubProject", githubProject.value);
    formData.append("githubBranch", githubBranch.value);
    formData.append("id", clientId);
    req.onloadend = showUploadDialog;
    req.open("POST", "/upload");
    req.send(formData);
  };

  const loadFileProcess = function (event) {
    if (event.target.files.length > 0) {
      const fileToLoad = event.target.files[0];
      updateFileName(fileToLoad.name);
      const fileReader = new FileReader();
      fileReader.onload = function () {
        updateAndHighlightMaybe(editor, fileReader.result as string, fileName);
        //        document.getElementById("editorTitle").click();
        setDirectory(false);
        setReadonly(false);
        autoSaveHash = null; // force save
        autoSave();
      };
      fileReader.readAsText(fileToLoad, "UTF-8");
    }
  };

  openTutorialInEditor = function (txt, fileName) {
    // similar to load file except went thru tutorial upload
    updateAndHighlightMaybe(editor, txt, "tutorials/" + fileName);
    setDirectory(false);
    setReadonly(true, "No syncing - read only file");
    document.location.hash = "#editor";
  };

  const loadFile = function () {
    turnOffSearchMode();
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    input.addEventListener("change", loadFileProcess, false);
    input.click();
  };

  const saveFile = function () {
    const content = editor.textContent as string;

    autoSave(); // may be wrong name!!! same pbl as right below
    const inputLink =
      "data:application/octet-stream," + encodeURIComponent(content);
    const inputParagraph = document.createElement("a");
    inputParagraph.setAttribute("href", inputLink);
    inputParagraph.setAttribute("download", fileName); // reuses the last loaded file name (but not saved!)
    inputParagraph.click();
  };

  const editorInput = function (e: InputEvent) {
    if (autoSaveTimeout) window.clearTimeout(autoSaveTimeout);
    if (e.inputType === "insertText" || e.inputType === "deleteContentBackward")
      // what else?
      delimiterHandling(editor);
    autoSaveTimeout = window.setTimeout(autoSave, 30000);
  };

  // starting text in editor TODO fix
  const e = /^#editor:(.+)$/.exec(url.hash);
  const [newName, rowcols] = e
    ? parseLocation(decodeURI(e[1]))
    : [getCookie(options.cookieFileName, "tutorials/default.m2"), null];
  newEditorFileMaybe(newName, rowcols, true);

  let tabPressed = false,
    enterPressed = false,
    searchMode = false;
  let searchString = "",
    prevSearchString = "";

  const turnOffSearchMode = function () {
    searchMode = false;
    document.getElementById("searchBox").style.display = "none";
  };

  const editorKeyDown = function (e) {
    removeAutoComplete(false, true); // remove autocomplete menu if open and move caret to right after
    //removeDelimiterHighlight(editor);
    if (searchMode) {
      if (editorKeyDownSearch(e)) {
        e.preventDefault();
        return;
      }
      turnOffSearchMode();
      const sel = window.getSelection() as any;
      sel.collapseToEnd();
    }
    enterPressed = e.key == "Enter" && !e.shiftKey; // for editorKeyUp
    if (e.key == "Enter" && e.shiftKey) {
      if (!caretIsAtEnd()) e.preventDefault();
      e.stopPropagation();
      editorEvaluate();
    } else if (e.key == "s" && e.ctrlKey) {
      // emacs binding
      if (!searchMode) {
        searchMode = true;
        prevSearchString = searchString;
        document.getElementById("searchString").textContent = searchString = "";
        document.getElementById("searchBox").style.display = "";
      }
      e.preventDefault();
    }
    if (e.key == "Escape") escapeKeyHandling();
    else if (e.key == "Tab" && !e.shiftKey && !tabPressed) {
      // try to avoid disrupting the normal tab use as much as possible
      tabPressed = true;
      if (!window.getSelection().isCollapsed || !autoCompleteHandling(editor))
        autoIndent(editor);
      e.preventDefault();
      return;
    } else if (e.key == "k" && e.ctrlKey) {
      // emacs binding
      const sel = window.getSelection() as any;
      sel.collapse(sel.focusNode, sel.focusOffset); // there has to be a simpler way...
      sel.modify("extend", "forward", "lineboundary");
      if (!sel.isCollapsed) document.execCommand("cut", false);
      else document.execCommand("forwardDelete", false);
      e.preventDefault();
    }
    tabPressed = false;
  };

  let searchSuccess = 0; // how many characters of the searchString we managed to find
  const editorKeyDownSearch = function (e) {
    // returns true to stay in search mode, false to leave it
    //    console.log("search: " + searchString + " + " + e.key);
    const pos0 = getCaret2(editor);
    if (pos0 === null) return false;
    let pos = pos0[0];
    if (e.key == "s" && e.ctrlKey) {
      if (searchString == "") searchString = prevSearchString;
      else if (searchSuccess < searchString.length) pos = 0;
      else pos += searchString.length;
    } else if (e.key == "Backspace") {
      if (searchString.length == 0) {
        e.preventDefault();
        return false;
      }
      searchString = searchString.substring(0, searchString.length - 1);
      if (searchSuccess > searchString.length)
        searchSuccess = searchString.length;
    } else if (e.key.length != "1" || e.ctrlKey || e.altKey) {
      return e.key == "Control" || e.key == "Shift"; // TODO: better
    } else {
      searchString = searchString + e.key;
    }
    const searchStringEl = document.getElementById("searchString");
    // display string
    const txt = editor.textContent;
    const i = txt.indexOf(searchString, pos);
    if (i >= 0) {
      searchSuccess = searchString.length;
      setCaret(editor, i, i + searchString.length, true).scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "end",
      });
      searchStringEl.textContent = searchString;
    } else {
      if (searchSuccess == searchString.length) searchSuccess = 0;
      searchStringEl.innerHTML =
        searchString.substring(0, searchSuccess) +
        "<span style='text-decoration:underline red'>" +
        searchString.substring(searchSuccess, searchString.length) +
        "</span>"; // eww
    }
    return true;
  };

  const editorKeyUp = function (e) {
    if (currentFileIsDirectory) return;
    if (e.key == "Enter" && !e.shiftKey && enterPressed) autoIndent(editor);
    enterPressed = false;
    if (e.key.startsWith("Arrow") || e.key.startsWith("Page"))
      delimiterHandling(editor);
    if (highlightTimeout) window.clearTimeout(highlightTimeout);
    if (!fileName || fileName.endsWith(".m2")) {
      highlightTimeout = window.setTimeout(function () {
        highlightTimeout = 0;
        const autoSaveHash1 = autoSaveHash;
        autoSaveHash = undefined; // no autosaving while syntax hiliting
        syntaxHighlight(editor);
        autoSaveHash = autoSaveHash1;
      }, 1500);
    }
  };

  const editorFocus = function () {
    tabPressed = false;
    enterPressed = false;
  };

  const editorCut = function (e) {
    turnOffSearchMode();
  };

  const editorPaste = function (e) {
    e.preventDefault();
    turnOffSearchMode();
    const c1 = e.clipboardData.getData("text/html");
    if (c1) {
      const returnNext = nextChar() == "\n";
      document.execCommand("insertHTML", false, c1);
      if (!returnNext && nextChar() == "\n")
        document.execCommand("forwardDelete"); // prevent annoying extra \n of chrome when pasting stuff with HTML tags
    } else {
      const c2 = e.clipboardData.getData("text/plain");
      if (c2) document.execCommand("insertText", false, c2);
    }
  };

  editor.onkeydown = editorKeyDown;
  editor.onkeyup = editorKeyUp;
  editor.oninput = editorInput;
  editor.onblur = autoSave;
  editor.onfocus = editorFocus;
  editor.oncut = editorCut;
  editor.onpaste = editorPaste;
  attachClick("searchClose", turnOffSearchMode);

  let activeEl;
  const saveActive = function () {
    activeEl = document.activeElement;
  };
  const restoreActive = function () {
    activeEl.focus();
  };
  const preserveActive = function (id) {
    const el = document.getElementById(id);
    el.onmousedown = saveActive;
    el.onmouseup = restoreActive;
  };

  const attachCtrlBtnActions = function () {
    attachClick("runBtn", editorEvaluate);
    attachClick("runAllEditor", editorEvaluateAll);
    attachClick("resetBtn", emitReset);
    attachClick("interruptBtn", myshell.interrupt);
    attachClick("saveBtn", saveFile);
    attachClick("loadBtn", loadFile);
    attachClick("clearBtn", clearOut);
    preserveActive("clearBtn");
    const el = document.getElementById("runBtn");
    if (el) {
      el.onmouseover = editorEvaluateHover;
      el.onmouseout = editorEvaluateOut;
    }
  };

  const attachCloseDialogBtns = function () {
    attachClick("uploadDialogClose", function () {
      (document.getElementById("uploadDialog") as any).close();
    });
    /*    attachClick("showFileDialogClose", function () {
      (document.getElementById("showFileDialog") as any).close();
    });*/
  };

  const queryCookie = function () {
    const id = getCookieId();
    let msg: string = id
      ? "The user id stored in your cookie is: " + id
      : "You don't have a cookie.";
    if (clientId != id) msg += "\nYour temporary id is: " + clientId;
    alert(msg);
  };

  // scroll button
  attachClick("scrollBtn", function () {
    scrollDown(terminal);
  });
  const scrollBtn = document.getElementById("scrollBtn");
  checkScrollButton = function () {
    scrollBtn.style.visibility =
      Math.ceil(terminal.scrollTop + terminal.clientHeight) <
      terminal.scrollHeight // Math.ceil because of annoying rounding errors
        ? "visible"
        : "hidden";
  };
  terminal.onscroll = checkScrollButton;
  terminal.addEventListener("load", checkScrollButton, true); // load does not bubble => we make it capturing
  preserveActive("scrollBtn");

  // zoom
  const attachZoomButtons = function (
    zoominId,
    resetId,
    zoomoutId,
    inputFactorOrDefault?
  ) {
    const inputFactor =
      typeof inputFactorOrDefault === "undefined" ? 1.1 : inputFactorOrDefault;
    let currentSize = 1.0;
    function applySize(factor) {
      currentSize *= factor;
      console.log("zoom: " + currentSize);
      const sizePercent = Math.round(currentSize * 100);
      terminal.onscroll = null;
      const scrollMiddle = terminal.scrollTop + terminal.clientHeight / 2;
      const scrollBtnVisibility =
        Math.ceil(terminal.scrollTop + terminal.clientHeight) <
        terminal.scrollHeight; // Math.ceil because of annoying rounding errors. rather than call checkScrollButton, more accurate
      terminal.style.fontSize = sizePercent.toString() + "%";
      terminal.scrollTop = scrollBtnVisibility
        ? factor * scrollMiddle - terminal.clientHeight / 2 // keep middle fixed
        : terminal.scrollHeight - terminal.clientHeight + 1; // +1 to allow for annoying rounding errors
      setTimeout(function () {
        terminal.onscroll = checkScrollButton;
      }, 0);
    }

    const zoomin = function () {
      applySize(inputFactor);
    };

    const zoomout = function () {
      applySize(1 / inputFactor);
    };

    const reset = function () {
      applySize(1 / currentSize);
    };

    attachClick(zoominId, zoomin);
    attachClick(zoomoutId, zoomout);
    attachClick(resetId, reset);
    [zoominId, zoomoutId, resetId].forEach(preserveActive);
  };

  attachZoomButtons("zoomInBtn", "resetZoomBtn", "zoomOutBtn");

  socket.on("chat", socketChat);

  if (chatForm) {
    const chatInput = document.getElementById("chatInput") as HTMLInputElement;
    const chatAlias = document.getElementById("chatAlias") as HTMLInputElement;
    // init alias as cookie or default
    chatAlias.value = getCookie(options.cookieAliasName, options.defaultAlias);
    chatAlias.onchange = function () {
      const alias = chatAlias.value.trim();
      chatAlias.value =
        alias === options.adminAlias ||
        alias === options.systemAlias ||
        alias.indexOf("/") >= 0 ||
        alias.indexOf(",") >= 0
          ? options.defaultAlias
          : alias;
      setCookie(options.cookieAliasName, chatAlias.value);
    };
    document.getElementById("pmto").onkeydown = chatAlias.onkeydown = function (
      e
    ) {
      if (e.key == "Enter") {
        chatInput.focus();
        e.preventDefault();
      }
    };

    chatInput.onkeydown = function (e) {
      if (e.key == "Enter" && e.shiftKey) e.stopPropagation(); // shift-enter, don't want it to kick in run-in-editor behavior
      if (e.key == "Enter" && !e.shiftKey) {
        e.preventDefault();
        const txt = chatInput.textContent.trim();
        if (txt != "") {
          const msg: Chat = {
            type: "message",
            alias: chatAlias.value,
            message: chatInput.innerHTML,
            text: txt,
            time: Date.now(),
          };
          if (
            (document.getElementById("pmtoggle") as HTMLInputElement).checked
          ) {
            msg.recipients = {};
            // parse list of recipients
            (document.getElementById("pmto") as HTMLInputElement).value
              .split(",")
              .forEach(function (rec: string) {
                const i = rec.indexOf("/");
                const id = i < 0 ? "" : rec.substring(0, i);
                const alias = i < 0 ? rec : rec.substring(i + 1);
                if ((id != "" || alias != "") && msg.recipients[id] !== null) {
                  // null means everyone
                  if (alias === "") msg.recipients[id] = null;
                  else {
                    if (msg.recipients[id] === undefined)
                      msg.recipients[id] = [];
                    msg.recipients[id].push(alias);
                  }
                }
              });
          } else msg.recipients = { "": null }; // to everyone

          socket.emit("chat", msg);
          chatInput.textContent = "";
        }
      }
    };
    // signal presence
    //    window.addEventListener("load", function () {
    syncChat();
    //    });
  }

  // chat pm
  attachClick("pmtoggle", function () {
    (document.getElementById("pmto") as HTMLInputElement).disabled =
      !this.checked;
  });

  attachCtrlBtnActions();
  attachCloseDialogBtns();

  attachClick("uploadBtn", uploadFile);

  attachClick("fullscreenTerminal", function () {
    if (document.fullscreenElement !== terminalDiv)
      terminalDiv.requestFullscreen();
    else document.exitFullscreen();
  });

  document.onfullscreenchange = function () {
    if (document.fullscreenElement === null) {
      scrollDown(document.getElementById("terminal"));
      const inp = document.getElementsByClassName("M2CurrentInput");
      if (inp.length > 0) (inp[0] as HTMLElement).focus();
    }
  };

  window.addEventListener("beforeunload", function () {
    autoSave(null, null, true);
  });

  const cookieQuery = document.getElementById("cookieQuery");
  if (cookieQuery) cookieQuery.onclick = queryCookie;

  socket.on("filechanged", fileChangedCheck);
};

export {
  extra1,
  extra2,
  setCookie,
  getCookieId,
  setCookieId,
  checkScrollButton,
  openTutorialInEditor,
};
