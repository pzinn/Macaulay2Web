const webpack = require('webpack');

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
		    use: 'ts-loader',
		    exclude: /node_modules/
		},
		{
		    test: /\.m2$|\.html$|\.txt$/,
		    use: 'raw-loader'
		},
		{
		    test: /KaTeX.*js$/,
		    use: 'babel-loader',
		    exclude: /node_modules/
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
				       "process.env.npm_package_version": JSON.stringify(process.env.npm_package_version) }),
	]
    };
};
