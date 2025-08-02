import type {NextConfig} from 'next';
import path from 'path';
import CopyPlugin from 'copy-webpack-plugin';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
   webpack: (config, { isServer }) => {
    // Correctly configure pdf.js worker
    config.plugins.push(
      new CopyPlugin({
        patterns: [
          {
            from: path.join(
              path.dirname(require.resolve('pdfjs-dist/package.json')),
              'build/pdf.worker.min.js'
            ),
            to: path.join(config.output.path as string, 'static/chunks/'),
          },
        ],
      })
    );
     // The `react-pdf` package needs this to be able to render PDFs.
    config.resolve.alias['pdfjs-dist'] = path.join(
      path.dirname(require.resolve('pdfjs-dist/package.json')),
      'build/pdf.js'
    );


    return config;
  },
};

export default nextConfig;
