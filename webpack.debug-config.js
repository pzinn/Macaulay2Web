module.exports = {
    entry: "./dist/frontend/index.js",
    output: {
	path: __dirname, // otherwise is put in "dist/"
	filename: "public/index.js"
    },
    mode: 'development',
    devtool: "inline-source-map"
};
