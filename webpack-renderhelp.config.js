const webpack = require('webpack');
const katexVersion = require('./KaTeX/package.json').version;

module.exports = env => {
    var mode,devtool;
    if (env.debug) {
	mode = "development";
	devtool = "inline-source-map";
    }
    else {
	mode = "production";
	devtool = false;
    }
    return {
	entry: "./src/renderhelp/renderhelp.ts",
	output: {
	    path: __dirname, // otherwise is put in "dist/"
	    filename: "public/renderhelp.js"
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
	    new webpack.DefinePlugin({ "MINIMAL": "true",
				       "process.env.npm_package_version": JSON.stringify(process.env.npm_package_version),
				       "__VERSION__": JSON.stringify(katexVersion) }),
	]
    };
};
