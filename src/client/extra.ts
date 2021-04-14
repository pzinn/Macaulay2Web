import Cookie from "cookie";
import { options } from "../common/global";
import { socket, url, myshell, clientId } from "./main";
import { scrollDown, setCaret, caretIsAtEnd, nextChar } from "./htmlTools";
import { socketChat, syncChat } from "./chat";
import {
  initTutorials,
  uploadTutorial,
  loadLessonIfChanged,
} from "./tutorials";
import { Chat } from "../common/chatClass";
import {
  escapeKeyHandling,
  autoCompleteHandling,
  removeAutoComplete,
  delimiterHandling,
  removeDelimiterHighlight,
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

const unsetCookie = function (name: string): void {
  document.cookie = Cookie.serialize(name, "", {
    expires: new Date(0),
    path: "/",
  });
};

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
  if (!fileName) return;
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
  const dialog = document.getElementById(
    "editorFileChanged"
  ) as HTMLDialogElement;
  if (dialog.open)
    // already open -- we're in trouble
    return; // ???

  document.getElementById("newEditorFileName").textContent = fileName;
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

const localFileToEditor = function (fileName: string, m?) {
  if (highlightTimeout) window.clearTimeout(highlightTimeout);
  const editor = document.getElementById("editorDiv");
  const xhr = new XMLHttpRequest();
  xhr.open("GET", fileName, true);
  xhr.onload = function () {
    updateAndHighlightMaybe(editor, xhr.responseText, fileName);
    autoSaveHash = hashCode(xhr.responseText);
    if (m) positioning(m);
  };
  xhr.send(null);
};

const positioning = function (m) {
  const editor = document.getElementById("editorDiv");
  // find location in file
  if (!m || !m[2]) {
    editor.focus({ preventScroll: true });
    return;
  }
  let row1 = +m[2];
  if (row1 < 1) row1 = 1;
  let col1 = m[3] ? +m[3] : 1;
  if (col1 < 1) col1 = 1;
  let row2 = m[5] ? +m[4] : row1;
  if (row2 < row1) row2 = row1;
  let col2 = m[5] ? +m[5] : m[4] ? +m[4] : col1;
  if (row2 == row1 && col2 < col1) col2 = col1;
  const editorText = editor.innerText;
  let j = -1;
  let k = 1;
  let j1, j2;
  while (true) {
    if (k == row1) j1 = j;
    else if (k == row1 + 1 && col1 > j - j1) col1 = j - j1;
    if (k == row2) j2 = j;
    else if (k == row2 + 1) {
      if (col2 > j - j2) col2 = j - j2;
      break;
    }
    j = editorText.indexOf("\n", j + 1);
    if (j < 0) break;
    k++;
  }
  j1 = j1 === undefined ? editorText.length : j1 + col1;
  j2 =
    j2 === undefined || j2 + col2 > editorText.length
      ? editorText.length
      : j2 + col2;
  setCaret(editor, j1, j2);
  // painful way of getting scrolling to work
  setTimeout(function () {
    // in case not in editor tab, need to wait
    document.execCommand("insertHTML", false, "<span id='scrll'></span>");
    document.getElementById("scrll").scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "center",
    });
    document.execCommand("undo", false, null);
  }, 0);
};

const newEditorFileMaybe = function (arg: string, missing: any) {
  // missing = what to do if file missing : false = nothing, true = create new, string = load this instead
  // parse newName for positioning
  // figure out filename
  const m = arg.match(/([^:]*)(?::(\d+)(?::(\d+)|)(?:-(\d+)(?::(\d+)|)|)|)/); // e.g. test.m2:3:5-5:7
  const newName = m ? m[1] : arg;
  if (fileName == newName || !newName) {
    updateFileName(newName); // in case of positioning data
    if (missing === false) document.location.hash = "#editor"; // HACK: for "Alt" key press TODO better
    positioning(m);
    return;
  }

  socket.emit("fileexists", newName, function (response) {
    if (!response) {
      if (missing === true) {
        updateFileName(newName);
        positioning(m);
        autoSaveHash = null; // force save
        autoSave();
        return;
      } else if (missing === false) return;
      response = missing;
    }
    if (missing === false) document.location.hash = "#editor"; // HACK: for "Alt" key press TODO better
    autoSave();
    updateFileName(newName);
    localFileToEditor(response, m);
  });
};

const extra1 = function () {
  const tabs = document.getElementById("tabs") as any;
  const iFrame = document.getElementById("browseFrame") as HTMLIFrameElement;

  let tab = url.hash;
  const m = /^#tutorial-(\w+)(?:-(\d+))?$/.exec(tab);
  let tute = m ? m[1] : null,
    page = m && m[2] ? +m[2] : 1;
  initTutorials(tute, page - 1);
  const upTutorial = document.getElementById("uptutorial");
  if (upTutorial) {
    upTutorial.onchange = uploadTutorial;
  }

  // supersedes mdl's internal tab handling
  const openTab = function () {
    let loc = document.location.hash.substring(1);
    // new syntax for navigating tutorial
    const m = /^tutorial(?:-(\w+))?(?:-(\d+))?$/.exec(loc);
    if (m) {
      loc = "tutorial";
      loadLessonIfChanged(m[1] || 0, (+m[2] || 1) - 1);
    }
    // editor stuff
    const e = /^editor:(.+)$/.exec(loc);
    if (e) {
      // do something *if* session started
      if (socket && socket.connected) newEditorFileMaybe(e[1], true);
      document.location.hash = "#editor"; // this will start over openTab
      return;
    }
    const panel = document.getElementById(loc);
    if (panel) {
      const tab = document.getElementById(loc + "Title");
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

  const getSelected = function () {
    // similar to trigger the paste event (except for when there's no selection and final \n) (which one can't manually, see below)
    const sel = window.getSelection() as any; // modify is still "experimental"
    if (editor.contains(sel.focusNode)) {
      // only if we're inside the editor
      if (sel.isCollapsed) {
        sel.modify("move", "backward", "lineboundary");
        sel.modify("extend", "forward", "lineboundary");
        const s = sel.toString();
        // sel.modify("move", "forward", "line"); // doesn't work in firefox
        sel.collapseToEnd();
        sel.modify("move", "forward", "character");
        return s;
      } else return sel.toString(); // fragInnerText(sel.getRangeAt(0).cloneContents()); // toString used to fail because ignored BR / DIV which firefox creates
    } else return "";
  };

  const editorEvaluate = function () {
    const msg = getSelected();
    myshell.postMessage(msg, false, false); // important not to move the pointer so can move to next line
    editor.focus(); // in chrome, this.blur() would be enough, but not in firefox
    /*
    const input = msg.split("\n");
    for (var line=0; line<input.length; line++) {
    if ((line<input.length-1)||(msg[msg.length-1]=="\n"))
    myshell.postMessage(input[line], false, false);
    }
    */
    // doesn't work -- feeding line by line is a bad idea, M2 then spits out input twice
    /*
    var dataTrans = new DataTransfer();
    dataTrans.setData("text/plain",msg);
    var event = new ClipboardEvent('paste',{clipboardData: dataTrans});
    document.getElementById("terminal").dispatchEvent(event);
    */
    // sadly, doesn't work either -- cf https://www.w3.org/TR/clipboard-apis/
    // "A synthetic paste event can be manually constructed and dispatched, but it will not affect the contents of the document."
  };

  const clearOut = function () {
    while (terminal.childElementCount > 1)
      terminal.removeChild(terminal.firstChild);
  };

  /*
const toggleWrap = function () {
  const out = document.getElementById("terminal");
  const btn = document.getElementById("wrapBtn");
  btn.classList.toggle("rotated");
  out.classList.toggle("M2Wrapped");
};
  */

  const fileNameEl = document.getElementById(
    "editorFileName"
  ) as HTMLInputElement;

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

  const clearEditorBtn = document.getElementById("clearEditorBtn");
  clearEditorBtn.onclick = function () {
    autoSave();
    editor.innerHTML = "";
    updateFileName("");
    fileNameEl.focus();
  };

  const showUploadDialog = function (event) {
    console.log("file upload returned status code " + event.target.status);
    const response = event.target.responseText;
    if (response) {
      const dialog = document.getElementById(
        "uploadSuccessDialog"
      ) as HTMLDialogElement;
      document.getElementById("uploadSuccessText").innerHTML = response;
      dialog.showModal();
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

  const uploadFile = function () {
    const dialog = document.createElement("input");
    dialog.setAttribute("type", "file");
    dialog.setAttribute("multiple", "true");
    dialog.addEventListener("change", uploadFileProcess, false);
    dialog.click();
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
    const dialog = document.createElement("input");
    dialog.setAttribute("type", "file"),
      dialog.addEventListener("change", loadFileProcess, false);
    dialog.click();
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
    enterPressed = false;
  const editorKeyDown = function (e) {
    enterPressed = e.key == "Enter" && !e.shiftKey; // for editorKeyUp
    removeAutoComplete(false, true); // remove autocomplete menu if open and move caret to right after
    removeDelimiterHighlight(editor);
    if (e.key == "Enter" && e.shiftKey) {
      if (!caretIsAtEnd()) e.preventDefault();
      const msg = getSelected();
      myshell.postMessage(msg, false, false);
    } else if (e.key == "Escape") escapeKeyHandling();
    else if (e.key == "Tab" && !e.shiftKey && !tabPressed) {
      // try to avoid disrupting the normal tab use as much as possible
      tabPressed = true;
      if (!window.getSelection().isCollapsed || !autoCompleteHandling(editor))
        autoIndent(editor);
      e.preventDefault();
      return;
    }
    tabPressed = false;
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
    const c = e.clipboardData.getData("text/html");
    document.execCommand("insertHTML", false, c);
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
    (document.getElementById("pmto") as HTMLInputElement).disabled = !this
      .checked;
  });

  attachCtrlBtnActions();
  attachCloseDialogBtns();

  attachClick("uploadBtn", uploadFile);

  window.addEventListener("beforeunload", function () {
    unsetCookie(options.cookieInstanceName);
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
