class Clautunnel < Formula
  desc "Remote monitoring and control for Claude Code CLI"
  homepage "https://github.com/TongilKim/clautunnel"
  url "https://registry.npmjs.org/@tongil_kim/clautunnel/-/clautunnel-0.1.4.tgz"
  sha256 "dd3f1ab27e15b70a35c98ea1d9527d057957b14be520f0df56f26b5a3d4787e5"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    system "#{bin}/clautunnel", "--version"
  end
end
