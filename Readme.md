# Macaulay2Web - a Web App for Macaulay2

Macaulay2Web is a web interface for the [Macaulay2](http://www.macaulay2.com).
It is based on [InteractiveShell](https://travis-ci.org/fhinkel/InteractiveShell).
What follows is somewhat outdated and in the process of being rewritten to take into account the differences
between Macaulay2Web and the original InteractiveShell.

## Quickstart

Run the following commands in a terminal (`vagrant` might take a while):
```bash
git clone https://github.com/pzinn/Macaulay2Web.git
cd Macaulay2Web/setups/basic
vagrant up
```
Point your browser to [localhost:8002](http://localhost:8002).

## Interactive Shell

At its core, **the web app is a terminal emulator, giving you an interface to a Macaulay2
instance running remotely.** The main advantage of providing a web app rather than a native app is that you
do not need to download and install Macaulay2,
thus easing the entry barrier for new users. We have also found that users unfamiliar with unix-style
command-line tools are more comfortable using a web app than a terminal.

The web app contains **interactive tutorials** that explain how to use the web app, show some more advanced features
of the app, e.g., retrieving files generated by Macaulay2, and teach basic and advanced algebraic geometry. You can
create your own tutorials. If you teach a course, email your tutorial to your students,
they can then click *Load Tutorial* on the website and work through the tutorial. If you want to share tutorials
with the community, we would be happy to include them on the website!

When you write functions or whole packages,
you will probably want to use the *Editor* area on the left: edit your Macaulay2 code on the left as if it were a
text editor. At any time,
you can run your code by clicking *Evaluate*. Evaluate either evaluates the current line or any code selected.
This is inspired by traditional Macaulay2 usage, which
has been designed to work with Emacs where a plugin allows you to run code from within the editor.

## Usage

This works from any device, even mobile, all
you need is a network connection. We start a new Macaulay2 instance for every user and provide
them with an underlying linux system of their own. Thus you can use all the features of
a natively installed Macaulay2 such as
executing linux commands through Macaulay2's `get` command, accessing the file system to write and read
files, and installing third party Macaulay2 packages.

We identify you by cookies. If you run long computations, you can come back later and we will
have the results ready for you. Occasionally, we have to reboot the server or deploy a new version, this,
 unfortunately, will delete your session. Also, we have to restrict resources since you are on a shared machine.

## Installation

If you want to use the web app offline or run very intense computations that need more resources than we provide,
you can easily run the web app locally or set up your own server.

### With Docker Containers (Recommended)

We have a Vagrant file that configures a virtual machine with everything you need to run your own Server with Macaulay2.
You do not need to install Macaulay2 locally.

Make sure [VirtualBox](https://www.virtualbox.org/) and [Vagrant](https://www.vagrantup.com/) are installed. On Windows,
we recommend to run
Vagrant from within [Git BASH](https://msysgit.github.io/). Do the following inside a terminal or Git BASH:

```bash
git clone https://github.com/pzinn/Macaulay2Web.git
cd Macaulay2Web/setups/basic
vagrant up
```

The web app is running at [http://localhost:8002](http://localhost:8002). Every Macaulay2 instance runs in a
separate Docker container with limited resources and does not have access to your
filesystem. Users can only access files inside their Docker container. You can manipulate the memory limits
of the server in the Vagrantfile and for the single users in the file {Macaulay2Web/src/server/startupConfigs/default.ts}.

If vagrant cannot mount due to a vboxfs not found error, do

```bash
vagrant plugin install vagrant-vbguest
```

### Without Virtualisation

If you do not want to run the web app within a virtual machine, you can run it locally. You need Macaulay2,
Node.js, npm, and Git. Furthermore you need to have a local ssh server running.
Try whether the following command works without prompting you for a password:

```bash
ssh -i ~/.ssh/id_rsa localhost
```

If not, please start an ssh server and include you public key in your authorized keys file.

Start the web app with the following commands:

```bash
git clone https://github.com/pzinn/Macaulay2Web.git
cd Macaulay2Web
npm install
npm run local
```

This gives you an (unsecured!) Macaulay2 terminal emulator at [http://localhost:8002](http://localhost:8002).
That means users can access and modify your private data through Macaulay2's `get` command. Make sure you do not
allow web access to your machine to other users on the same network, i.e., make sure your laptop's firewall is on.
The port may be different, check the console output where you started the server for
 `Server running on [port]`.

### Scaling Up (Advanced)

With Vagrant it is easy to run the web app in the cloud, e.g., at AWS or DigitalOcean. You need to customize the file
 `Vagrantfile_aws` with your credentials.

When you teach large classes, the resources on one machine might not suffice. Remember, for every user we start a
Docker container with Macaulay2. The Docker containers and the server
that handles requests can be on remote machines because they communicate via ssh.
We have a vagrant configuration that starts server and containers on separate instances.

```bash
cd separate_machines
vagrant up
```


### Adjusting resource limits
You can manipulate the resource limits of the virtual machine in the Vagrantfile. Furthermore the startup files in the
dircectory
```
Macaulay2Web/src/server/startupConfigs
```
contain several default values for the resource limits of the single container.

If you manipulate these files and want to manually restart, enter the directory of the setup you are using and
```bash
vagrant ssh
killall node
cd Macaulay2Web
npm run basic
```


### Linting
We use Eslint
```bash
npm run lint
```

### Running the server
We recommend developing locally and running
```bash
vagrant up developer
```
In this setup, the source code is symlinked between your host and guest system.
Allowing you to develop locally but having the complete setup with Docker and separate virtual machines for
server and Docker containers. To start different versions run

```bash
npm run local  ## insecure -  without Docker containers
npm start ## basic with Docker containers
npm run twoMachines ## Docker containers on different machine than server
```

## Command line arguments:
You can append to the URL, say
http://localhost:8002
or
https://www.unimelb-macaulay2.cloud.edu.au
the following:
* `/minimal.html` for a minimal interface, which can be embedded into a web page, e.g. with
```
<iframe style="background:#A8A8B8;overflow:hidden;resize:both" scrolling="no" src='https://www.unimelb-macaulay2.cloud.edu.au/minimal.html' title="Macaulay2"></iframe>
```
* `#[home|tutorial|editor|about|browse]` to start in a different tab (in the normal interface). `#tutorial-m-n` to go to page `n` of tutorial `m`.
* `?public[=name]` -- this option is turned on by default for the minimal interface.
The user does not get his own Macaulay2 process but rather a shared process for all users (the name can be used to specify a particular process for a given page).
Note that this does not overwrite the cookie containing your personal user id.
* `?user[=name]` to choose one's own user id. This allows e.g. to have the same shell on different computers or share one's shell with someone else.
Note that if you have already been assigned a user id, this will overwrite it (i.e., it will overwrite the cookie containing it), so use with caution
(if you don't know your previous user id, you will lose access to your previous session).
At the moment, the only way to know your current user id is to click on the word "cookie" on the home page.
* `?loadtutorial=[filename]` to load a tutorial that's stored in your Macaulay2 docker (rather than locally).
## Internal file structure:
### Server
* main file:
`dist/server/index.js`
produced by `tsc`:
```bash
npx tsc
```
(or `./node_modules/.bin/tsc`) from `src/server/index.ts`
* other files:
`dist/server/*.js` `dist/server/startupConfigs/*.js`
from
`src/server/*.ts` `src/server/startupConfigs/*.ts`

### Client
* main file:
`public/index.js`
produced by `webpack` from `src/client/*.ts` using `ts-loader`
and called by
`public/index.html`.
* alternatively one can transpile first using
```bash
npx tsc -p src/client
```

