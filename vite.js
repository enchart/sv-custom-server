import EventEmitter from 'node:events';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';

/**
 * @param {import('vite').ResolvedConfig} config
 * @param {import('node:http').Server} httpServer
 * @returns {undefined | import('rollup').MaybePromise<void>}
 */
async function runInitServerHook(config, httpServer) {
	let file = path.join(config.root, 'src/hooks.server');
	if (existsSync(`${file}.js`)) {
		file += '.js';
	} else if (existsSync(`${file}.ts`)) {
		file += '.ts';
	} else {
		return undefined;
	}

	// Note: '?t=' causes a memory leak over time in long dev sessions (Node module cache),
	// but is the standard way to force-reload in dev.
	/** @type {{ initHttpServer?: import('./index').InitHttpServer }} */
	const { initHttpServer } = await import(/* @vite-ignore */ `file://${file}?t=${Date.now()}`);
	return await initHttpServer?.({ server: httpServer, settings: {} });
}

/**
 * @param {import('http').Server} httpServer
 * @returns {import('http').Server}
 */
function createHttpServerProxy(httpServer) {
	const eventEmitter = new EventEmitter();
	httpServer.on('upgrade', (req, socket, head) => {
		if (req.headers['sec-websocket-protocol'] === 'vite-hmr') {
			return;
		}
		eventEmitter.emit('upgrade', req, socket, head);
	});

	return new Proxy(httpServer, {
		get(target, prop) {
			if (['on', 'addListener', 'once'].includes(prop)) {
				return (event, listener) => {
					if (event !== 'upgrade') {
						return target.addListener(event, listener);
					}
					eventEmitter.addListener('upgrade', listener);
					return target;
				};
			} else if (['removeListener'].includes(prop)) {
				return (event, listener) => {
					if (event !== 'upgrade') {
						return target.removeListener(event, listener);
					}
					eventEmitter.removeListener('upgrade', listener);
					return target;
				};
			}

			return target[prop];
		}
		// get(target, prop) {
		// 	if (['on', 'addListener', 'once'].includes(prop)) {
		// 		console.log('add listener');
		// 	} else if (['removeListener'].includes(prop)) {
		// 		console.log('remove listener');
		// 	}

		// 	return target[prop];

		// 	// if (!['on', 'addListener', 'once'].includes(prop)) {
		// 	// 	return target[prop];
		// 	// }

		// 	// return (event, listener) => {
		// 	// 	if (event !== 'upgrade') {
		// 	// 		return target.addListener(event, listener);
		// 	// 	}

		// 	// 	return target.addListener(event, (req, socket, head) => {
		// 	// 		if (req.headers['sec-websocket-protocol'] === 'vite-hmr') {
		// 	// 			console.log('prevented vite-hmr websocket');
		// 	// 			return;
		// 	// 		}

		// 	// 		listener(req, socket, head);
		// 	// 	});
		// 	// };
		// }
	});
}

/**
 * @returns {import('vite').Plugin}
 */
export function httpServer() {
	/** @type {import('vite').ResolvedConfig} */
	let config;

	/** @type {import('node:http').Server} */
	let httpServer;

	/** @type {undefined | import('rollup').MaybePromise<void>} */
	let shutdown;

	/** @type {WebSocketServer} */
	let wss;

	return {
		name: 'sv-websocket',

		configResolved(cfg) {
			config = cfg;
		},

		async configureServer(server) {
			httpServer = createHttpServerProxy(server.httpServer);
			shutdown = await runInitServerHook(config, httpServer);
			httpServer.on('close', async () => await shutdown?.());

			globalThis.sv_websocket_server = httpServer;
			globalThis.sv_websocket_settings = {};
		},

		async handleHotUpdate({ file }) {
			let name = path.resolve(file);
			if (!name.startsWith(path.resolve(config.root, 'src/hooks.server'))) {
				return;
			}

			console.log('hmr');
			// wss?.close();
			// wss = new WebSocketServer({ server: httpServer });
			// wss.on('connection', () => console.log('connected'));
			await shutdown?.();
			shutdown = await runInitServerHook(config, httpServer);
		}

		// async configureServer(server) {
		// 	httpServer = server.httpServer;
		// 	// httpServer.on('upgrade', (req, socket, head) => {
		// 	// 	if (req.headers['sec-websocket-protocol'] !== 'vite-hmr') {
		// 	// 		wsUpgradeEmitter.emit('upgrade', req, socket, head);
		// 	// 	}
		// 	// });
		// 	shutdown = await runInitServerHook(config, httpServer);
		// 	httpServer.on('close', async () => await shutdown?.());
		// },

		// async configurePreviewServer(server) {
		// 	httpServer = server.httpServer;
		// 	// httpServer.on('upgrade', (req, socket, head) => {
		// 	// 	if (req.headers['sec-websocket-protocol'] !== 'vite-hmr') {
		// 	// 		wsUpgradeEmitter.emit('upgrade', req, socket, head);
		// 	// 	}
		// 	// });
		// 	shutdown = await runInitServerHook(config, httpServer);
		// 	httpServer.on('close', async () => await shutdown?.());
		// },

		// async handleHotUpdate({ file }) {
		// 	let name = path.resolve(file);
		// 	if (!name.startsWith(path.resolve(config.root, 'src/hooks.server'))) {
		// 		return;
		// 	}

		// 	name = path.basename(name);
		// 	config.logger.info(colors.green(`${name} changed, restarting server...`), {
		// 		timestamp: true,
		// 		clear: true
		// 	});

		// 	// await shutdown?.();
		// 	// shutdown = await runInitServerHook(config, httpServer);
		// }
	};
}
