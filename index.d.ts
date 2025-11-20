import http from 'node:http';
import { Adapter } from '@sveltejs/kit';
import './ambient.js';

declare global {
	const ENV_PREFIX: string;
}

interface AdapterOptions {
	out?: string;
	precompress?: boolean;
	envPrefix?: string;
}

type Cleanup = () => void | Promise<void>;

export type InitHttpServer = (options: {
	server: http.Server;
	settings: App.HttpServerSettings;
}) =>
  | void
  | Cleanup
  | Promise<void | Cleanup>;

export default function plugin(options?: AdapterOptions): Adapter;
