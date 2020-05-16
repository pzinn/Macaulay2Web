module.exports = {
    entry: "./public-source/index.js",
    output: {
	path: __dirname, // otherwise is put in "dist/"
	filename: "public/public-common/index.js"
    },
    mode: 'development',
    devtool: "inline-source-map"
};
