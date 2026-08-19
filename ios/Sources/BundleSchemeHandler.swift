//
//  BundleSchemeHandler.swift
//
//  アプリバンドル内の www/ を独自スキーム（houserule://app/...）で配信する。
//  file:// では ES Modules が同一オリジン扱いにならず import が失敗するため、
//  正規のスキームとして扱えるカスタムハンドラを用意している。
//
import Foundation
import WebKit

final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {

    static let scheme = "houserule"
    static let host = "app"

    private let root: URL

    override init() {
        // Copy Bundle Resources で www ディレクトリを丸ごと同梱している
        if let dir = Bundle.main.url(forResource: "www", withExtension: nil) {
            root = dir
        } else {
            root = Bundle.main.bundleURL
        }
        super.init()
    }

    private static let mimeTypes: [String: String] = [
        "html": "text/html; charset=utf-8",
        "js": "text/javascript; charset=utf-8",
        "mjs": "text/javascript; charset=utf-8",
        "css": "text/css; charset=utf-8",
        "json": "application/json; charset=utf-8",
        "webmanifest": "application/manifest+json; charset=utf-8",
        "svg": "image/svg+xml",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "ico": "image/x-icon",
        "md": "text/markdown; charset=utf-8",
        "woff2": "font/woff2",
    ]

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }

        // パス正規化（.. でバンドル外へ出られないようにする）
        var relative = url.path
        if relative.isEmpty || relative == "/" { relative = "/web/index.html" }
        let cleaned = relative
            .split(separator: "/")
            .filter { $0 != ".." && $0 != "." }
            .joined(separator: "/")
        let fileURL = root.appendingPathComponent(cleaned)

        guard let data = try? Data(contentsOf: fileURL) else {
            let body = Data("Not Found: \(cleaned)".utf8)
            let response = HTTPURLResponse(
                url: url, statusCode: 404, httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "text/plain; charset=utf-8"]
            )!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(body)
            urlSchemeTask.didFinish()
            return
        }

        let ext = fileURL.pathExtension.lowercased()
        let mime = Self.mimeTypes[ext] ?? "application/octet-stream"
        let response = HTTPURLResponse(
            url: url, statusCode: 200, httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": mime,
                "Content-Length": String(data.count),
                "Cache-Control": "no-store",
                "Access-Control-Allow-Origin": "*",
            ]
        )!
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // 同期読み込みのみのため中断処理は不要
    }
}
