module.exports = {
    entry: "./dist/frontend/index.js",
    output: {
	path: __dirname, // otherwise is put in "dist/"
	filename: "public/index.js"
    },
    module: {
	rules: [
	    {
		test: /\.m2|\.html|\.txt$/,
		use: [ 'raw-loader' ]
	    }
	]
    },
    mode: 'production',
};
