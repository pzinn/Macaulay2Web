const webpack = require('webpack');
const katexVersion = require('./KaTeX/package.json').version;

module.exports = env => {
    var mode,filename,entry,devtool;
    if (env.debug) {
	mode = "development";
	devtool = "inline-source-map";
    }
    else {
	mode = "production";
	devtool = false;
    }
    const appMode = env.tutorial ? "tutorial" : env.minimal ? "minimal" : "full";
    if (appMode === "tutorial") {
	entry = "./src/client/tutorial-entry.ts";
	filename = "public/tutorial.js";
    } else {
	entry = appMode === "minimal"
	    ? "./src/client/minimal-entry.ts"
	    : "./src/client/index.ts";
	filename = appMode === "minimal" ? "public/minimal.js" : "public/index.js";
    }
    return {
	entry: entry,
	output: {
	    path: __dirname, // otherwise is put in "dist/"
	    filename: filename
	},
	module: {
	    rules: [
		{
		    test: /\.ts$/,
		    use: {
			loader: 'ts-loader',
			options: {
			    transpileOnly: true
			}
		    },
		    exclude: /node_modules/
		},
		{
		    test: /\.m2$|\.html$|\.txt$/,
		    use: 'raw-loader'
		}
	    ]
	},
	resolve: {
	    extensions: [ '.ts', '.js' ],
	},
	mode: mode,
	devtool: devtool,
	plugins: [
	    new webpack.DefinePlugin({ "APP_MODE": JSON.stringify(appMode),
				       "process.env.npm_package_version": JSON.stringify(process.env.npm_package_version),
				       "__VERSION__": JSON.stringify(katexVersion) }),
	]
    };
};
