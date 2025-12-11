import EventEmitter from 'node:events';
import { existsSync } from 'node:fs';
import path from 'node:path';
import colors from 'picocolors';

/**
 * @param {import('vite').ResolvedConfig} config
 * @param {import('vite').ViteDevServer} viteServer
 * @param {import('node:http').Server} httpServer
 * @param {App.HttpServerContext} context
 * @returns {undefined | import('rollup').MaybePromise<void>}
 */
async function runInitServerHook(config, viteServer, httpServer, context) {
	let file = path.join(config.root, 'src/hooks.server');
	if (existsSync(`${file}.js`)) {
		file += '.js';
	} else if (existsSync(`${file}.ts`)) {
		file += '.ts';
	} else {
		return undefined;
	}

	/** @type {{ initHttpServer?: import('./index').InitHttpServer }} */
	const { initHttpServer } = await viteServer.ssrLoadModule(file);
	return await initHttpServer?.({ server: httpServer, context });
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
	});
}

/**
 * @returns {import('vite').Plugin}
 */
export default function customServer() {
	/** @type {import('vite').ResolvedConfig} */
	let config;

	/** @type {import('node:http').Server} */
	let httpServer;

	/** @type {undefined | import('rollup').MaybePromise<void>} */
	let shutdown;

	return {
		name: 'sv-websocket',

		configResolved(cfg) {
			config = cfg;
		},

		async configureServer(server) {
			httpServer = createHttpServerProxy(server.httpServer);
			globalThis.sv_custom_server = {
				server: httpServer,
				context: {}
			};

			shutdown = await runInitServerHook(
				config,
				server,
				httpServer,
				globalThis.sv_custom_server.context
			);
			httpServer.on('close', () => async () => await shutdown?.());
		},

		async configurePreviewServer(server) {
			httpServer = createHttpServerProxy(server.httpServer);
			globalThis.sv_custom_server = {
				server: httpServer,
				context: {}
			};

			shutdown = await runInitServerHook(
				config,
				server,
				httpServer,
				globalThis.sv_custom_server.context
			);

			httpServer.on('close', async () => await shutdown?.());
		},

		async handleHotUpdate({ server, file }) {
			let name = path.resolve(file);
			if (!name.startsWith(path.resolve(config.root, 'src/hooks.server'))) {
				return;
			}

			try {
				await shutdown?.();
				config.logger.info(colors.green(`${path.basename(file)} changed, restarting server...`), {
					timestamp: true,
					clear: true
				});
			} catch (err) {
				config.logger.error(colors.red(`Failed to run server cleanup function`), {
					timestamp: true
				});
				config.logger.error(err?.stack ?? err, { timestamp: true });
			}

			shutdown = await runInitServerHook(
				config,
				server,
				httpServer,
				globalThis.sv_custom_server.context
			);
		}
	};
}
