import path from 'path';
import type { Configuration } from '@rspack/cli';

module.exports = {
	context: __dirname,
	entry: {
		main: "./src/main.ts",
		app: "./src/app.ts"
	},
	output: {
		filename: '[name].js',
		path: path.resolve(__dirname, 'dist'),
	},
	module: {
		rules: [
			{
				test: /\.svg$/,
				type: "asset"
			}
		]
	},
	externalsPresets: {
		node: true
	}
} satisfies Configuration;

