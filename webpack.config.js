module.exports = {
    entry: "./public-source/index.js",
    output: {
	path: __dirname, // otherwise is put in "dist/"
	filename: "public/public-common/TESTindex.js"
    },
    mode: 'production',
};
