import Cookie from "cookie";
import { options } from "../common/global";
import { socket, url, myshell, clientId } from "./main";
import {
  scrollDown,
  scrollDownLeft,
  setCaret,
  caretIsAtEnd,
} from "./htmlTools";
import { socketChat, syncChat } from "./chat";
import tutorials from "./tutorials";
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
  document.location.hash = "editor";
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
  let j1;
  while (true) {
    if (k == row1) j1 = j;
    if (k == row2) break;
    j = editorText.indexOf("\n", j + 1);
    if (j < 0) {
      setCaret(editor, editorText.length);
      return;
    }
    k++;
  }
  if (m[4]) setCaret(editor, j1 + col1, j + col2);
  else setCaret(editor, j1 + col1);
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

const newEditorFileMaybe = function (arg: string, createNew: boolean) {
  // parse newName for positioning
  // figure out filename
  const m = arg.match(/([^:]*)(?::(\d+)(?::(\d+)|)(?:-(\d+)(?::(\d+)|)|)|)/); // e.g. test.m2:3:5-5:7
  const newName = m ? m[1] : arg;
  if (fileName == newName) {
    updateFileName(newName); // in case of positioning data
    positioning(m);
    return;
  }

  socket.emit("fileexists", newName, function (response) {
    if (!response) {
      if (createNew) {
        updateFileName(newName);
        positioning(m);
        autoSaveHash = null; // force save
        autoSave();
      }
    } else {
      autoSave();
      updateFileName(newName);
      localFileToEditor(response, m);
    }
  });
};

const extra1 = function () {
  const tabs = document.getElementById("tabs") as any;
  const iFrame = document.getElementById("browseFrame");
  let tab = url.hash;

  //  const loadtute = url.searchParams.get("loadtutorial");
  const m = /^#tutorial(?:-(\d*))?(?:-(\d*))?$/.exec(tab);
  let tute = 0,
    page = 1;
  if (m) {
    tute = +m[1] || 0;
    page = +m[2] || 1;
  }
  const tutorialManager = tutorials(tute, page - 1);
  const upTutorial = document.getElementById("uptutorial");
  if (upTutorial) {
    upTutorial.onchange = tutorialManager.uploadTutorial;
  }

  // supersedes mdl's internal tab handling
  const openTab = function () {
    let loc = document.location.hash.substring(1);
    // new syntax for navigating tutorial
    const m = /^tutorial(?:-(\d*))?(?:-(\d*))?$/.exec(loc);
    if (m) {
      loc = "tutorial";
      if (m[1] || m[2])
        tutorialManager.loadLessonIfChanged(+m[1] || 0, (+m[2] || 1) - 1);
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
    const iFrame = document.getElementById("browseFrame") as HTMLIFrameElement;
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

  if (tabs) {
    document.location.hash = "";
    window.addEventListener("hashchange", openTab);
    if (tab === "")
      //      if (loadtute) tab = "#tutorial";
      //	else
      tab = "#home";
    document.location.hash = tab;
  }

  if (iFrame) iFrame.onload = openBrowseTab;
};

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

  let preventEnterKeyUp = false; // annoying: Enter key wrongly triggers autoIndent when loading new file into editor

  //  fileNameEl.onfocus = autoSave; // simple way to save, plus avoids issues with autosaving while onchange running
  fileNameEl.onchange = function () {
    const newName = fileNameEl.value.trim();
    newEditorFileMaybe(newName, true);
  };
  fileNameEl.onkeydown = function (e) {
    if (e.key == "Enter") {
      preventEnterKeyUp = true;
    }
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

  updateFileName(getCookie(options.cookieFileName, "default.m2"));

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

  const delayedAction = function () {
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
    attachClick("showFileDialogClose", function () {
      (document.getElementById("showFileDialog") as any).close();
    });
  };

  const attachMinMaxBtnActions = function () {
    const dialog: any = document.getElementById("fullScreenOutput");
    if (dialog) {
      const maximize = document.getElementById("maximizeOutput");
      const downsize = document.getElementById("downsizeOutput");
      const zoomBtns = document.getElementById("terminalZoomBtns");
      const output = document.getElementById("terminal");
      dialog.onclose = function () {
        const oldPosition = document.getElementById("right-half");
        const ctrl = document.getElementById("terminalCtrlBtns");
        oldPosition.appendChild(output);
        ctrl.insertBefore(zoomBtns, maximize);
        scrollDownLeft(output);
      };
      attachClick("maximizeOutput", function () {
        const maxCtrl = document.getElementById("terminalCtrlBtnsMax");
        /*    if (!dialog.showModal) {
		  dialogPolyfill.registerDialog(dialog);
		  }*/
        dialog.appendChild(output);
        maxCtrl.insertBefore(zoomBtns, downsize);
        dialog.showModal();
        output.focus();
        scrollDownLeft(output);
      });
      attachClick("downsizeOutput", function () {
        dialog.close();
      });
    }
  };

  const editorKeyDown = function (e) {
    //    var prismInvoked=false;
    removeAutoComplete(false, true); // remove autocomplete menu if open and move caret to right after
    removeDelimiterHighlight(editor);
    if (e.key == "Enter" && e.shiftKey) {
      if (!caretIsAtEnd()) e.preventDefault();
      const msg = getSelected();
      myshell.postMessage(msg, false, false);
    } else if (e.key == "Escape") escapeKeyHandling();
    else if (e.key == "Tab") {
      // try to avoid disrupting the normal tab use as much as possible
      if (!e.shiftKey && autoCompleteHandling(editor)) {
        e.preventDefault();
        return;
      }
    }
  };

  const editorKeyUp = function (e) {
    if (e.key == "Enter" && !e.shiftKey) {
      if (preventEnterKeyUp) preventEnterKeyUp = false;
      else autoIndent(editor);
    } else delimiterHandling(e.key, editor);
  };

  const queryCookie = function () {
    const id = getCookieId();
    let msg: string = id
      ? "The user id stored in your cookie is: " + id.substring(4)
      : "You don't have a cookie.";
    if (clientId != id)
      msg += "\nYour temporary id is: " + clientId.substring(4);
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
                const id = i < 0 ? "" : "user" + rec.substring(0, i);
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

  // starting text in editor
  socket.emit("fileexists", fileName, function (response) {
    if (!response) {
      if (fileName != "default.m2") return;
      response = "default.orig.m2";
    }
    localFileToEditor(response);
  });

  attachMinMaxBtnActions();
  attachCtrlBtnActions();
  attachCloseDialogBtns();

  if (editor) {
    editor.onkeydown = editorKeyDown;
    editor.onkeyup = editorKeyUp;
    editor.oninput = delayedAction;
    editor.onblur = autoSave;
  }

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
