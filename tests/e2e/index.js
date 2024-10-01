const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const httpProxy = require("http-proxy");

function* port(port) {
  while (true) {
    yield port++;
  }
}

function* id() {
	let id = 1;
	while (true) {
		yield id++;
	}
}

class WriterProcess {
	constructor(path, port) {
		this.path = path;
    this.process = null;
    this.initialized = false;
    this.port = port;
    this.busy = false;
	}
  async start() {
    return new Promise((resolve, reject) => {
      if (this.process !== null) {
        this.process.kill();
      }
      const wf = spawn(
        "writer",
        ["edit", this.path, "--port", this.port]
      );
      this.process = wf;
      const startupTimeout = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.error("Writer Framework startup timeout");
        wf.kill();
        reject();
      }, 5000);

      wf.stdout.on("data", (data) => {
        // eslint-disable-next-line no-console
        console.log(
          `[${wf.pid}] stdout: ${Buffer.from(data, "utf-8").toString()}`,
        );
        if (data.includes("Builder is available at")) {
          this.initialized = true;
          clearTimeout(startupTimeout);
          resolve(wf);
        }
      });

      wf.stderr.on("data", (data) => {
        // eslint-disable-next-line no-console
        console.error(`[${wf.pid}] stderr: ${data}`);
      });

      wf.on("close", () => {
        // eslint-disable-next-line no-console
        console.log(`[${wf.pid}] child process closed`);
      });
      wf.on("error", (err) => {
        // eslint-disable-next-line no-console
        console.log(`[${wf.pid}] child process error`, err);
      });
      wf.on("exit", (code) => {
        // eslint-disable-next-line no-console
        this.process = null;
        console.log(
          `[${wf.pid}] child process exited with code ${code}`,
        );
      });
    });
  }

	get pid() {
		return this.process.pid;
	}

  async stop() {
    return new Promise((resolve) => {
      if (this.process) {
        const timeout = setTimeout(() => {
					console.warn("Killing process", this.process.pid);
          this.process.kill("SIGKILL");
        }, 15000);
        this.process.once("exit", () => {
					clearTimeout(timeout);
          resolve();
        });
        this.process.kill("SIGTERM");
      } else {
        resolve();
      }
    });
  }
}

class WriterProcessPool {
	constructor() {
		this.genPort = port(7358);
		this.genId = id();
		this.processes = {};
	}

	async start(preset) {
		const id = this.genId.next().value;
		await fs.mkdir(`./runtime/${id}`);
		await fs.cp(`./presets/${preset}/.wf`, `./runtime/${id}/.wf`, { recursive: true });
		await fs.copyFile(`./presets/${preset}/main.py`, `./runtime/${id}/main.py`);
		const process = new WriterProcess(`./runtime/${id}`, this.genPort.next().value);
		await process.start();
		this.processes[id] = process;
		return id;
	}

	async stop(id) {
		const process = this.processes[id];
		if(process) {
			await process.stop();
			delete this.processes[id];
		}
		await fs.rm(`./runtime/${id}`, { recursive: true });
	}


}

const sspp = new WriterProcessPool();
(async () => {
	await fs.rm(`./runtime`, { recursive: true, force: true });
  await fs.mkdir("runtime", { recursive: true });
})();

var proxy = httpProxy.createProxyServer();

proxy.on('error', function (e) {
  // eslint-disable-next-line no-console
  console.error(e);
});

const app = express();

app.post("/preset/:preset", async (req, res) => {
	try {
		console.log("Loading preset", req.params.preset);
		const id = await sspp.start(req.params.preset);
		res.json({url: `/${id}/`})
	} catch (e) {
		console.error(e);
		res.status(500).send(e);
	}
});

app.delete("/:id/", async (req, res) => {
	try {
		await sspp.stop(req.params.id);
		res.send("Server cleanup");
	} catch (e) {
		console.error(e);
		res.status(500).send(e);
	}
});

app.use('/:id/', (req, res) => {
	try {
		const process = sspp.processes[req.params.id];
		if(!process || process.initialized === false) {
			res.send("Server not initialized yet");
			return;
		}
		proxy.web(req, res, {target: 'http://127.0.0.1:'+ process.port});
	} catch (e) {
		console.error(e);
		res.status(500).send(e);
	}
});


const server = app.listen(7357, () => {
  // eslint-disable-next-line no-console
  console.log("Server is running on port 7357");
});

server.on('upgrade', (req, socket, head) => {
	try{
		const id = req.url.split("/")[1];
		const wf = sspp.processes[id];
		req.url = req.url.replace(`/${id}/`, '/');
		proxy.ws(req, socket, head, {target: 'ws://127.0.0.1:'+wf.port, ws: true});
	} catch (e) {
		console.error(e);
	}
});
