module.exports = {
    entry: "./dist/frontend/index.js",
    output: {
	path: __dirname, // otherwise is put in "dist/"
	filename: "public/public-common/index.js"
    },
    mode: 'production',
};
