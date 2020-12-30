const webpack = require('webpack');

module.exports = env => {
    var mode,filename,devtool;
    if (env.debug) {
	mode = "development";
	devtool = "inline-source-map";
    }
    else {
	mode = "production";
	devtool = false;
    }
    if (env.minimal) filename = "public/minimal.js"; else filename = "public/index.js";
    return {
	entry: "./dist/frontend/index.js",
	output: {
	    path: __dirname, // otherwise is put in "dist/"
	    filename: filename
	},
	module: {
	    rules: [
		{
		    test: /\.m2|\.html|\.txt$/,
		    use: [ 'raw-loader' ]
		},
		{
		    test: /KaTeX.*js$/,
		    exclude: /node_modules/,
		    use: {
			loader: 'babel-loader',
		    }
		}
	    ]
	},
	mode: mode,
	devtool: devtool,
	plugins: [
	    new webpack.DefinePlugin({ MINIMAL: env.minimal }),
	]
    };
};
