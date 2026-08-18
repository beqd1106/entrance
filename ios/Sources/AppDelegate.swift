//
//  AppDelegate.swift
//  M-Pass — 雀荘のハウスルールを体験するアプリ
//
//  Web実装（ルールエンジン＋UI）をアプリ内にバンドルし、
//  ネットワークなしでも動作するネイティブシェル。
//
import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = GameViewController()
        window.backgroundColor = UIColor(red: 0.04, green: 0.18, blue: 0.16, alpha: 1)
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    /// 横持ち固定（卓を最大化するため）
    func application(
        _ application: UIApplication,
        supportedInterfaceOrientationsFor window: UIWindow?
    ) -> UIInterfaceOrientationMask {
        .landscape
    }
}
