const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  target: 'electron-renderer',
  entry: './src/renderer/index.tsx',
  output: {
    filename: 'renderer.js',
    path: path.resolve(__dirname, 'dist/renderer'),
    clean: true,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      // Allow renderer to import from core and shared without '../../../' chains
      '@core':   path.resolve(__dirname, 'src/core'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            // Use a separate tsconfig for the renderer to include React JSX
            configFile: path.resolve(__dirname, 'tsconfig.json'),
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        // Bundle the Tabler icon webfont locally (works offline in the truck)
        test: /\.(woff2?|ttf|eot|svg)$/,
        type: 'asset/resource',
        generator: { filename: 'fonts/[name][ext]' },
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html',
      filename: 'index.html',
    }),
  ],
  devtool: 'source-map',
};
