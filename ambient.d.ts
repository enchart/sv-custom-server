import http from 'node:http';

declare global {
	namespace App {
		export interface Platform {
			/**
			 * The original Node HTTP server object (https://nodejs.org/api/http.html#class-httpserver)
			 */
			server: http.Server;

			settings: HttpServerSettings & Record<string, any>;
		}

		export interface HttpServerSettings {}
	}
}
