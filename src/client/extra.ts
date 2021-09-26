import Cookie from "cookie";
import { options } from "../common/global";
import { socket, url, myshell, clientId } from "./main";
import {
  scrollDown,
  setCaret,
  getCaret2,
  caretIsAtEnd,
  nextChar,
  selectRowColumn,
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
  if (newName == fileName) return;
  const pastFileNames = document.getElementById(
    "pastFileNames"
  ) as HTMLSelectElement;
  let flag = true;
  Array.from(pastFileNames.options).forEach(function (opt: HTMLOptionElement) {
    if (opt.textContent == fileName) flag = false;
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

let autoSaveTimeout = 0;
let autoSaveHash;
const autoSave = function () {
  if (autoSaveTimeout) {
    window.clearTimeout(autoSaveTimeout);
    autoSaveTimeout = 0;
  }
  if (
    !fileName ||
    autoSaveHash === undefined ||
    document.getElementById("editorDiv").contentEditable != "true"
  )
    return; // the autoSaveHash === undefined is important -- sometimes autoSave gets called too early, *after* fileName has been set but *before* file has been loaded / hash computed
  const content = document.getElementById("editorDiv").innerText as string;
  const newHash = hashCode(content);
  if (newHash != autoSaveHash) {
    const file = new File([content], fileName);
    const formData = new FormData();
    formData.append("files[]", file);
    formData.append("id", clientId);
    autoSaveHash = newHash;
    formData.append("hash", autoSaveHash);
    /*    const req = new XMLHttpRequest();
	      req.open("POST", "/upload");
	      //req.onloadend = showUploadDialog;
	      req.send(formData);*/
    navigator.sendBeacon("/upload", formData);
  }
};

let highlightTimeout = 0;

const fileChangedCheck = function (data) {
  if (data.fileName != fileName || data.hash == autoSaveHash) return;
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
  const editor = document.getElementById("editorDiv");
  const xhr = new XMLHttpRequest();
  xhr.open("GET", fileName, true);
  xhr.onload = function () {
    editor.contentEditable = "true";
    updateAndHighlightMaybe(editor, xhr.responseText, fileName);
    autoSaveHash = hashCode(xhr.responseText);
    if (rowcols) selectRowColumn(document.getElementById("editorDiv"), rowcols);
  };
  xhr.send(null);
};

const listDirToEditor = function (dirName: string, fileName: string) {
  if (!dirName.endsWith("/")) dirName += "/";
  if (highlightTimeout) window.clearTimeout(highlightTimeout);
  const editor = document.getElementById("editorDiv");
  const xhr = new XMLHttpRequest();
  xhr.open("GET", fileName, true);
  xhr.onload = function () {
    editor.contentEditable = "false";
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
  xhr.send(null);
};

const newEditorFileMaybe = function (arg: string, missing: any) {
  // missing = what to do if file missing : false = nothing, true = create new, string = load this instead
  // get rid of leading "./"
  if (arg.length > 2 && arg.startsWith("./")) arg = arg.substring(2);
  // parse newName for positioning
  // figure out filename
  const m = arg.match(
    //    /([^:]*)(?::(\d+)(?::(\d+)|)(?:-(\d+)(?::(\d+)|)|)|)/
    /^([^:]+):(\d+)(?::(\d+)|)(?:-(\d+)(?::(\d+)|)|)/
  ) as any; // e.g. test.m2:3:5-5:7
  const newName = m ? m[1] : arg;
  const el = document.getElementById("editorDiv");

  let rowcols;
  if (!m) el.focus({ preventScroll: true });
  else {
    rowcols = [];
    // parse m
    rowcols[0] = +m[2];
    if (rowcols[0] < 1) rowcols[0] = 1;
    rowcols[1] = m[3] ? +m[3] : 1;
    if (rowcols[1] < 1) rowcols[1] = 1;
    rowcols[2] = m[5] ? +m[4] : rowcols[0];
    if (rowcols[2] < rowcols[0]) rowcols[2] = rowcols[0];
    rowcols[3] = m[5] ? +m[5] : m[4] ? +m[4] : rowcols[1];
    if (rowcols[2] == rowcols[0] && rowcols[3] < rowcols[1])
      rowcols[3] = rowcols[1];
  }

  if (newName == "stdio") {
    // special case
    if (rowcols) myshell.selectPastInput(rowcols);
    return;
  }
  if (fileName == newName || !newName) {
    // file already open in editor
    updateFileName(newName); // in case of positioning data
    if (missing === false) document.location.hash = "#editor"; // HACK: for "Alt" key press TODO better
    if (rowcols) selectRowColumn(el, rowcols);
    return;
  }

  socket.emit("fileexists", newName, function (response) {
    if (!response) {
      if (missing === true) {
        updateFileName(newName);
        if (el.contentEditable != "true") {
          el.contentEditable = "true";
          el.innerHTML = "";
        }
        if (rowcols) selectRowColumn(el, rowcols);
        autoSaveHash = null; // force save
        autoSave();
        return;
      } else if (missing === false) return;
      response = missing;
    }
    if (missing === false) document.location.hash = "#editor"; // HACK: for "Alt" key press TODO better
    autoSave();
    updateFileName(newName);
    if (response.search("directory@") >= 0) listDirToEditor(newName, response);
    // eww
    else localFileToEditor(response, rowcols);
  });
};

const extra1 = function () {
  const tabs = document.getElementById("tabs") as any;
  const iFrame = document.getElementById("browseFrame") as HTMLIFrameElement;

  let tab = url.hash;
  initTutorials();

  // supersedes mdl's internal tab handling
  const openTab = function () {
    let loc = document.location.hash.substring(1);
    // new syntax for navigating tutorial
    const m = /^tutorial(?:-(\w+))?(?:-(\d+))?$/.exec(loc);
    if (m) {
      loc = "tutorial";
      renderLessonMaybe(m[1], m[2]);
    }
    // editor stuff
    const e = /^editor:(.+)$/.exec(loc);
    if (e) {
      // do something *if* session started
      if (socket && socket.connected) newEditorFileMaybe(decodeURI(e[1]), true);
      document.location.hash = "#editor"; // this will start over openTab
      return;
    }
    const panel = document.getElementById(loc);
    if (panel) {
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
    }
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
    document.body.style.userSelect = "";
  };
  resize.onmousedown = resizeMouseDown;
};

// 2nd part: once session active
const extra2 = function () {
  const terminal = document.getElementById("terminal");
  const editor = document.getElementById("editorDiv");
  const chatForm = document.getElementById("chatForm");

  const editorEvaluate = function () {
    // similar to trigger the paste event (except for when there's no selection and final \n) (which one can't manually, see below)
    const sel = window.getSelection() as any; // modify is still "experimental"
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
      } else s = sel.toString(); // fragInnerText(sel.getRangeAt(0).cloneContents()); // toString used to fail because ignored BR / DIV which firefox creates
      myshell.postMessage(s, false, false); // important not to move the pointer so can move to next line
      // s.split("\n").forEach((line) => myshell.postMessage(line, false, false)); // should work fine now that echo mode is on but not needed
      editor.focus(); // in chrome, this.blur() would be enough, but not in firefox
    }
  };

  const clearOut = function () {
    while (terminal.childElementCount > 1)
      terminal.removeChild(terminal.firstChild);
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
    const newName = fileNameEl.value.trim();
    newEditorFileMaybe(newName, true);
  };
  const pastFileNames = document.getElementById(
    "pastFileNames"
  ) as HTMLSelectElement;
  pastFileNames.onfocus = function () {
    pastFileNames.selectedIndex = -1;
  }; // dirty trick found on the internet...
  pastFileNames.onchange = function () {
    const newName = pastFileNames.options[pastFileNames.selectedIndex].text;
    newEditorFileMaybe(newName, true);
  };

  const homeEditorBtn = document.getElementById("homeEditorBtn");
  homeEditorBtn.onclick = function () {
    autoSave();
    newEditorFileMaybe("./", false);
  };

  const clearEditorBtn = document.getElementById("clearEditorBtn");
  clearEditorBtn.onclick = function () {
    autoSave();
    editor.innerHTML = "";
    editor.contentEditable = "true";
    updateFileName("");
    fileNameEl.focus();
  };

  const showUploadDialog = function (event) {
    console.log("file upload returned status code " + event.target.status);
    const response = event.target.responseText;
    if (response) {
      const dialog = document.getElementById("uploadSuccessDialog") as any; //HTMLDialogElement;
      if (dialog.showModal) {
        dialog.style.display = ""; // turned off for safari etc that don't support Dialog
        document.getElementById("uploadSuccessText").innerHTML = response;
        dialog.showModal();
      }
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
  };

  const fileUploadInput = document.createElement("input");
  fileUploadInput.setAttribute("type", "file");
  fileUploadInput.setAttribute("multiple", "true");
  fileUploadInput.addEventListener("change", uploadFileProcess, false);

  const uploadFile = function () {
    fileUploadInput.click();
  };

  const loadFileProcess = function (event) {
    if (event.target.files.length > 0) {
      const fileToLoad = event.target.files[0];
      updateFileName(fileToLoad.name);
      const fileReader = new FileReader();
      fileReader.onload = function () {
        updateAndHighlightMaybe(editor, fileReader.result as string, fileName);
        //        document.getElementById("editorTitle").click();
        autoSaveHash = null; // force save
        autoSave();
      };
      fileReader.readAsText(fileToLoad, "UTF-8");
    }
  };

  const loadFile = function () {
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    input.addEventListener("change", loadFileProcess, false);
    input.click();
  };

  const saveFile = function () {
    const content = editor.innerText as string;

    autoSave(); // may be wrong name!!! same pbl as right below
    const inputLink =
      "data:application/octet-stream," + encodeURIComponent(content);
    const inputParagraph = document.createElement("a");
    inputParagraph.setAttribute("href", inputLink);
    inputParagraph.setAttribute("download", fileName); // reuses the last loaded file name (but not saved!)
    inputParagraph.click();
  };

  const editorInput = function () {
    delimiterHandling(editor);
    if (highlightTimeout) window.clearTimeout(highlightTimeout);
    if (fileName.endsWith(".m2")) {
      highlightTimeout = window.setTimeout(function () {
        highlightTimeout = 0;
        syntaxHighlight(editor);
      }, 1500);
    }
    if (autoSaveTimeout) window.clearTimeout(autoSaveTimeout);
    autoSaveTimeout = window.setTimeout(autoSave, 30000);
  };

  // starting text in editor
  const e = /^#editor:(.+)$/.exec(url.hash);
  const newName = e ? e[1] : getCookie(options.cookieFileName, "default.m2");
  newEditorFileMaybe(
    newName,
    newName == "default.m2" ? "default.orig.m2" : true
  ); // possibly get the default file from the server

  let tabPressed = false,
    enterPressed = false,
    searchMode = false;
  let searchString = "",
    prevSearchString = "";

  const editorKeyDown = function (e) {
    removeAutoComplete(false, true); // remove autocomplete menu if open and move caret to right after
    //removeDelimiterHighlight(editor);
    if (searchMode) {
      if (editorKeyDownSearch(e)) {
        e.preventDefault();
        return;
      }
      searchMode = false;
      document.getElementById("searchSpan").style.display = "none";
      const sel = window.getSelection() as any;
      sel.collapseToEnd();
    }
    enterPressed = e.key == "Enter" && !e.shiftKey; // for editorKeyUp
    if (e.key == "Enter" && e.shiftKey) {
      if (!caretIsAtEnd()) e.preventDefault();
      editorEvaluate();
    } else if (e.key == "Escape") escapeKeyHandling();
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
      document.execCommand("cut", false);
      e.preventDefault();
    } else if (e.key == "s" && e.ctrlKey) {
      // emacs binding
      if (!searchMode) {
        searchMode = true;
        prevSearchString = searchString;
        document.getElementById("searchString").textContent = searchString = "";
        document.getElementById("searchSpan").style.display = "";
      }
      e.preventDefault();
    }
    tabPressed = false;
  };

  let searchSuccess = 0; // how many characters of the searchString we managed to find
  const editorKeyDownSearch = function (e) {
    //    console.log("search: " + searchString + " + " + e.key);
    let pos = getCaret2(editor)[0];
    if (e.key == "s" && e.ctrlKey) {
      if (searchString == "") searchString = prevSearchString;
      else if (searchSuccess == 0) pos = 0;
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
    const txt = editor.innerText;
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
    if (e.key == "Enter" && !e.shiftKey && enterPressed) autoIndent(editor);
    enterPressed = false;
  };

  const editorFocus = function () {
    tabPressed = false;
    enterPressed = false;
  };

  const editorPaste = function (e) {
    // prevent annoying extra \n of chrome when pasting stuff with HTML tags
    const returnNext = nextChar() == "\n";
    e.preventDefault();
    const c =
      e.clipboardData.getData("text/html") ||
      e.clipboardData.getData("text/plain");
    document.execCommand("insertHTML", false, c); // slightly unusual behavior: it will paste text/plain as HTML... e.g. <b>YO</b>
    if (!returnNext && nextChar() == "\n")
      document.execCommand("forwardDelete");
  };

  editor.onkeydown = editorKeyDown;
  editor.onkeyup = editorKeyUp;
  editor.oninput = editorInput;
  editor.onblur = autoSave;
  editor.onfocus = editorFocus;
  editor.onpaste = editorPaste;

  const attachCtrlBtnActions = function () {
    attachClick("sendBtn", editorEvaluate);
    attachClick("resetBtn", emitReset);
    attachClick("interruptBtn", myshell.interrupt);
    attachClick("saveBtn", saveFile);
    attachClick("loadBtn", loadFile);
    //    attachClick("highlightBtn", highlight);
    attachClick("clearBtn", clearOut);
    //  attachClick("wrapBtn", toggleWrap);
  };

  const attachCloseDialogBtns = function () {
    attachClick("uploadSuccessDialogClose", function () {
      (document.getElementById("uploadSuccessDialog") as any).close();
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

  // zoom
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

  const attachZoomButtons = function (
    textareaID,
    zoominID,
    resetID,
    zoomoutID,
    inputFactorOrDefault?
  ) {
    const inputFactor =
      typeof inputFactorOrDefault === "undefined"
        ? 1.1
        : sanitizeFactor(inputFactorOrDefault);
    const sizes = {
      factor: inputFactor,
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

    attachClick(zoominID, zoomin);
    attachClick(zoomoutID, zoomout);
    attachClick(resetID, reset);
  };

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

    chatInput.onkeypress = function (e) {
      if (e.key == "Enter" && !e.shiftKey) {
        e.preventDefault();
        const txt = chatInput.innerHTML;
        if (txt != "") {
          const msg: Chat = {
            type: "message",
            alias: chatAlias.value,
            message: txt,
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

  attachZoomButtons(
    "terminal",
    "terminalZoomIn",
    "terminalResetZoom",
    "terminalZoomOut"
  );

  // chat pm
  attachClick("pmtoggle", function () {
    (document.getElementById("pmto") as HTMLInputElement).disabled =
      !this.checked;
  });

  attachCtrlBtnActions();
  attachCloseDialogBtns();

  attachClick("uploadBtn", uploadFile);

  window.addEventListener("beforeunload", function () {
    autoSave();
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
  newEditorFileMaybe,
};
