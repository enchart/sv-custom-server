declare global {
	var sv_custom_server: {
		server: import('node:http').Server;
		context: App.Platform['context'];
	}
}

declare module 'ENV' {
	export function env(key: string, fallback?: any): string;
}

declare module 'HANDLER' {
	import http from 'node:http';

	export const handler: (
		httpServer: http.Server,
		context: App.HttpServerContext
	) => import('polka').Middleware;

	export const initHttpServer: import('./index.d.ts').InitHttpServer | undefined;
}

declare module 'MANIFEST' {
	import { SSRManifest } from '@sveltejs/kit';

	export const base: string;
	export const manifest: SSRManifest;
	export const prerendered: Set<string>;
}

declare module 'SERVER' {
	export { Server } from '@sveltejs/kit';
}

export {};
