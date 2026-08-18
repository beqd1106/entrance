//
//  GameViewController.swift
//
//  WKWebView に同梱アプリを表示するだけのシェル。
//  UIはWeb側（web/）が担当し、ネイティブ側は表示条件だけを整える。
//
import UIKit
import WebKit

final class GameViewController: UIViewController, WKNavigationDelegate {

    private var webView: WKWebView!

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        // 端末幅にぴったり合わせる（ユーザーによる拡大は無効）
        let viewport = """
        var m = document.querySelector('meta[name=viewport]');
        if (m) { m.setAttribute('content',
          'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'); }
        document.documentElement.style.setProperty('-webkit-user-select', 'none');
        document.documentElement.style.setProperty('-webkit-touch-callout', 'none');
        """
        config.userContentController.addUserScript(
            WKUserScript(source: viewport, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        )

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.04, green: 0.18, blue: 0.16, alpha: 1)
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.showsVerticalScrollIndicator = false
        if #available(iOS 16.4, *) {
            webView.isInspectable = true   // 実機デバッグ用（Safari Web Inspector）
        }
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        loadApp()
    }

    private func loadApp() {
        var comps = URLComponents()
        comps.scheme = BundleSchemeHandler.scheme
        comps.host = BundleSchemeHandler.host
        comps.path = "/web/index.html"
        comps.fragment = "/"
        guard let url = comps.url else { return }
        webView.load(URLRequest(url: url))
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }

    /// 外部リンク（SNS・店舗サイト）はSafariで開く
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        if url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showLoadError(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showLoadError(error)
    }

    private func showLoadError(_ error: Error) {
        let label = UILabel()
        label.text = "起動に失敗しました\n\(error.localizedDescription)"
        label.numberOfLines = 0
        label.textAlignment = .center
        label.textColor = .white
        label.frame = view.bounds
        label.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(label)
    }
}
