import {AuthOption} from "../lib/enums";

const mathJaxTagsArray = [1, 2, 3, 4, 5].map((x) => String.fromCharCode(x));
const [mathJaxTextTag,        // indicates what follows is pure text; default mode
       mathJaxHtmlTag,        // indicates what follows is HTML
       mathJaxOutputTag,      // it's html but it's output
       mathJaxInputTag,       // it's text but it's input
       mathJaxInputContdTag] // text, continuation of input
      = mathJaxTagsArray;

const options = {
  cookieName: "tryM2",
  authentication: AuthOption.none,
  serverConfig: {
    CONTAINERS: "../lib/LocalContainerManager",
    MATH_PROGRAM: "Macaulay2",
      // tslint:disable-next-line:max-line-length
    MATH_PROGRAM_COMMAND: "export PATH=~/bin:$PATH; export WWWBROWSER=open; M2-experimental -e \"printWidth=0; topLevelMode = MathJax\"",
    port: "8003",
      // tslint:disable-next-line:max-line-length
      resumeString: "Type " + mathJaxHtmlTag + "<span class=\"M2PastInput\" onclick=\"document.getElementsByClassName('M2CurrentInput')[0].textContent=this.textContent\">listUserSymbols</span>" + mathJaxTextTag + " to print the list of existing symbols.\n\ni* : " + mathJaxInputTag,
  },
  startInstance: {
    host: "127.0.0.1",
    username: "m2user",
    port: "123",
    sshKey: "/home/ubuntu/InteractiveShell/id_rsa",
    containerName: "",
  },
  perContainerResources: {
    cpuShares: 2,
    memory: 256,
  },
  hostConfig: {
    minContainerAge: 10,
    maxContainerNumber: 1,
    containerType: "m2container",
    sshdCmd: "/usr/sbin/sshd -D",
    dockerCmdPrefix: "sudo ",
    host: "192.168.2.42",
    username: "ubuntu",
    port: "22",
    sshKey: "/home/ubuntu/keys/host_key",
  },
  help: require("./HelpMacaulay2").help(),
};

const overrideDefaultOptions = function(overrideOptions, defaultOptions) {
  for (const opt in overrideOptions) {
    if (defaultOptions.hasOwnProperty(opt)) {
      if (defaultOptions[opt] instanceof Function) {
        defaultOptions[opt] = overrideOptions[opt];
      } else if (defaultOptions[opt] instanceof Object) {
        overrideDefaultOptions(overrideOptions[opt], defaultOptions[opt]);
      } else {
        defaultOptions[opt] = overrideOptions[opt];
      }
    } else {
      defaultOptions[opt] = overrideOptions[opt];
    }
  }
};

export {options, overrideDefaultOptions};
