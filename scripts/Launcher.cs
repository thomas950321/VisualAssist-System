using System;
using System.Diagnostics;
using System.IO;
using System.Text;

namespace VisualAssistLauncher
{
    class Program
    {
        static void Main(string[] args)
        {
            Console.OutputEncoding = Encoding.UTF8;
            Console.Title = "穿戴式視覺輔助系統 (VisualAssist System) - 啟動器";

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string scriptPath = Path.Combine(baseDir, "scripts", "launch.ps1");

            if (!File.Exists(scriptPath))
            {
                // Fallback: search parent directory if running from scripts folder
                string parentScript = Path.Combine(baseDir, "..", "scripts", "launch.ps1");
                if (File.Exists(parentScript))
                {
                    scriptPath = Path.GetFullPath(parentScript);
                    baseDir = Path.GetDirectoryName(Path.GetDirectoryName(scriptPath));
                }
            }

            if (!File.Exists(scriptPath))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("錯誤：找不到核心腳本 " + scriptPath);
                Console.ResetColor();
                Console.WriteLine("請確認本執行檔位於 VisualAssist_System 專案根目錄中。");
                Console.WriteLine("按任意鍵退出...");
                Console.ReadKey();
                return;
            }

            string escapedScriptPath = scriptPath.Replace("\\", "\\\\");
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "powershell.exe";
            psi.Arguments = string.Format("-NoProfile -ExecutionPolicy Bypass -Command \"[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $code = [System.IO.File]::ReadAllText('{0}', [System.Text.Encoding]::UTF8); & ([ScriptBlock]::Create($code))\"", escapedScriptPath);
            psi.WorkingDirectory = baseDir;
            psi.UseShellExecute = false;

            try
            {
                using (Process proc = Process.Start(psi))
                {
                    proc.WaitForExit();
                }
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("啟動失敗: " + ex.Message);
                Console.ResetColor();
                Console.WriteLine("按任意鍵退出...");
                Console.ReadKey();
            }
        }
    }
}
