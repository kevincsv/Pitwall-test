; Pitlane HQ installer (Inno Setup 6). Built by CI: iscc /DAppVersion=x.y.z installer\PitlaneHQ.iss
; One app: the native window (PitlaneHQ.Desktop.exe, self-contained .NET, so nothing else has to be
; installed; WebView2 is part of Windows 10/11) with the agent (PitlaneHQ.exe) next to it as its engine.
; Installs for the current user only (no administrator needed), so the built-in updater can replace
; the files later.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6F1E2B7A-4C59-4E8B-9C3D-PITLANEHQ001}
AppName=Pitlane HQ
AppVersion={#AppVersion}
AppPublisher=Pitlane HQ
AppPublisherURL=https://pitlanehq.app
DefaultDirName={localappdata}\Programs\Pitlane HQ
DefaultGroupName=Pitlane HQ
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist-installer
OutputBaseFilename=PitlaneHQ-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; normal size and centred on the screen (also with Windows display scaling)
WizardSizePercent=100
WizardResizable=no
LicenseFile=EULA.txt
UninstallDisplayIcon={app}\PitlaneHQ.Desktop.exe
SetupIconFile=..\assets\pitlanehq.ico
CloseApplications=yes
RestartApplications=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "pt"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[CustomMessages]
es.StartWithWindows=Abrir Pitlane HQ al iniciar Windows
en.StartWithWindows=Open Pitlane HQ when Windows starts
pt.StartWithWindows=Abrir o Pitlane HQ ao iniciar o Windows
es.StartGroup=Inicio:
en.StartGroup=Start:
pt.StartGroup=Início:

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startup"; Description: "{cm:StartWithWindows}"; GroupDescription: "{cm:StartGroup}"; Flags: unchecked

[Files]
; the window (self-contained .NET publish) and the agent next to it
Source: "..\out-desktop\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "EULA.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\docs\legal\PRIVACY.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
; installs made while the app was called TrackIQ (0.5–0.6.1): that program and its shortcuts go, PitlaneHQ.exe takes over
Type: files; Name: "{app}\TrackIQ.exe"
Type: files; Name: "{group}\TrackIQ.lnk"
Type: files; Name: "{userdesktop}\TrackIQ.lnk"
; the native window's preview had its own install: one app now
Type: files; Name: "{group}\Pitlane HQ Desktop (preview).lnk"
Type: files; Name: "{userdesktop}\Pitlane HQ Desktop.lnk"

[Icons]
Name: "{group}\Pitlane HQ"; Filename: "{app}\PitlaneHQ.Desktop.exe"; AppUserModelID: "PitlaneHQ.App"
Name: "{group}\{cm:UninstallProgram,Pitlane HQ}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\Pitlane HQ"; Filename: "{app}\PitlaneHQ.Desktop.exe"; Tasks: desktopicon

[Registry]
; PitlaneHQ.exe -minimized opens the window minimized (installs that already start with Windows keep working)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PitlaneHQ"; ValueData: """{app}\PitlaneHQ.exe"" -minimized"; Tasks: startup; Flags: uninsdeletevalue
; installs that already start with Windows: their entry now points to PitlaneHQ.exe
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PitlaneHQ"; ValueData: """{app}\PitlaneHQ.exe"" -minimized"; Check: RunEntryExists
; the start-with-Windows switch inside the app uses this name
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "PitWall"; Flags: dontcreatekey uninsdeletevalue

[Run]
Filename: "{app}\PitlaneHQ.Desktop.exe"; Description: "{cm:LaunchProgram,Pitlane HQ}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; close Pitlane HQ (the window, the agent and its overlay windows) before removing it
Filename: "{sys}\taskkill.exe"; Parameters: "/F /T /IM PitlaneHQ.Desktop.exe"; Flags: runhidden; RunOnceId: "ClosePitlaneHQDesktop"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /T /IM PitlaneHQ.exe"; Flags: runhidden; RunOnceId: "ClosePitlaneHQ"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /T /IM TrackIQ.exe"; Flags: runhidden; RunOnceId: "CloseOldTrackIQ"

[UninstallDelete]
; everything Pitlane HQ created on this PC: the app folder (and the updater's leftovers), settings, profiles,
; sign-ins, race history, track notes, logs, the live link and its browser data. Nothing on the server is
; touched: the account, the leaderboards and the coach model stay.
Type: filesandordirs; Name: "{app}"
Type: filesandordirs; Name: "{userappdata}\PitlaneHQ"
Type: filesandordirs; Name: "{userappdata}\PitWall"
Type: filesandordirs; Name: "{localappdata}\PitlaneHQ"

[Code]
const
  PreviewKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{6F1E2B7A-4C59-4E8B-9C3D-PITLANEHQDSK}_is1';

// handles and BOOLs as Integer: Setup is a 32-bit program
function OpenEvent(dwDesiredAccess: Cardinal; bInheritHandle: Integer; lpName: String): Integer; external 'OpenEventW@kernel32.dll stdcall';
function SetEvent(hEvent: Integer): Integer; external 'SetEvent@kernel32.dll stdcall';
function OpenMutex(dwDesiredAccess: Cardinal; bInheritHandle: Integer; lpName: String): Integer; external 'OpenMutexW@kernel32.dll stdcall';
function CloseHandle(hObject: Integer): Integer; external 'CloseHandle@kernel32.dll stdcall';

// Pitlane HQ running (in the notification area too) quits as its icon's Quit does, so its icon leaves the notification
// area; taskkill /F stays as the fallback for a window that does not answer (or one from before the notification area)
procedure QuitPitlaneHQ();
var
  H: Integer;
  I: Integer;
begin
  H := OpenEvent($0002, 0, 'Local\PitlaneHQ.Desktop.Quit'); // EVENT_MODIFY_STATE
  if H = 0 then
    Exit;
  SetEvent(H);
  CloseHandle(H);
  // its engine stops within 3 s: wait for the window to be gone, 8 s at most
  for I := 1 to 80 do
  begin
    H := OpenMutex($00100000, 0, 'Local\PitlaneHQ.Desktop'); // SYNCHRONIZE
    if H = 0 then
      Exit;
    CloseHandle(H);
    Sleep(100);
  end;
end;

function RunEntryExists: Boolean;
begin
  Result := RegValueExists(HKCU, 'Software\Microsoft\Windows\CurrentVersion\Run', 'PitlaneHQ');
end;

procedure InitializeWizard();
begin
  WizardForm.Position := poScreenCenter;
end;

// the native window's preview (its own install, "Pitlane HQ Desktop") goes quietly: this is the same window now
procedure RemovePreview();
var
  Cmd: String;
  Code: Integer;
begin
  if RegQueryStringValue(HKCU, PreviewKey, 'UninstallString', Cmd) then
  begin
    QuitPitlaneHQ();
    Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /T /IM PitlaneHQ.Desktop.exe', '', SW_HIDE, ewWaitUntilTerminated, Code);
    Exec(RemoveQuotes(Cmd), '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_HIDE, ewWaitUntilTerminated, Code);
  end;
end;

// before the files are checked for programs using them: Pitlane HQ quits by itself (Restart Manager closes what is left)
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  QuitPitlaneHQ();
  Result := '';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
    RemovePreview();
end;

// before [UninstallRun]'s taskkill: Pitlane HQ quits by itself first
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
    QuitPitlaneHQ();
end;
