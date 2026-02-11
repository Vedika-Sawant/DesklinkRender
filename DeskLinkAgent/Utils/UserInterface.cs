using System;
using System.Runtime.InteropServices;

namespace DeskLinkAgent.Utils;

public static class UserInterface
{
    // P/Invoke for MessageBox
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr hWnd, String text, String caption, uint type);

    private const uint MB_YESNO = 0x00000004;
    private const uint MB_ICONQUESTION = 0x00000020;
    private const uint MB_TOPMOST = 0x00040000;
    private const int IDYES = 6;

    public static bool ShowRequestDialog(string requesterName)
    {
        // Simple blocking dialog on the Agent machine
        // In a real production app, this might be a proper WPF/WinForms window or system notification
        // For now, MessageBox is sufficient for the MVP.
        
        string message = $"Remote Access Request\n\nUser '{requesterName}' is requesting control of this device.\n\nDo you want to allow this connection?";
        string title = "DeskLink Agent";
        
        // MB_YESNO | MB_ICONQUESTION | MB_TOPMOST (to ensure it appears on top)
        int result = MessageBox(IntPtr.Zero, message, title, MB_YESNO | MB_ICONQUESTION | MB_TOPMOST);

        return result == IDYES;
    }
}
