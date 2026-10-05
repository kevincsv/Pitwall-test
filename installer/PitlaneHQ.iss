; Pitlane HQ installer (Inno Setup 6). Built by CI: iscc /DAppVersion=x.y.z installer\PitlaneHQ.iss
; Installs for the current user only (no administrator needed), so the
; built-in updater can replace the files later.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6F1E2B7A-4C59-4E8B-9C3D-PITLANEHQ001}
AppName=Pitlane HQ
AppVersion={#AppVersion}
AppPublisher=Pitlane HQ
AppPublisherURL=https://github.com/kevincsv/Pitwall-test
DefaultDirName={localappdata}\Programs\PitlaneHQ
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
UninstallDisplayIcon={app}\PitlaneHQ.exe
CloseApplications=yes
RestartApplications=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "de"; MessagesFile: "compiler:Languages\German.isl"
Name: "pt"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Types]
Name: "full"; Description: "{cm:FullInstall}"
Name: "compact"; Description: "{cm:CompactInstall}"
Name: "custom"; Description: "{cm:CustomInstall}"; Flags: iscustom

[Components]
Name: "app"; Description: "Pitlane HQ"; Types: full compact custom; Flags: fixed
Name: "azom"; Description: "{cm:AzomComponent}"; Types: full

[CustomMessages]
es.AzomComponent=Plugin AZOM para SimHub (pantallas y volantes MOZA · software libre GPL v3)
en.AzomComponent=AZOM plugin for SimHub (MOZA screens and wheels · free software, GPL v3)
de.AzomComponent=AZOM-Plugin für SimHub (MOZA-Displays und -Lenkräder · freie Software, GPL v3)
pt.AzomComponent=Plugin AZOM para SimHub (telas e volantes MOZA · software livre, GPL v3)
es.StartWithWindows=Abrir Pitlane HQ al iniciar Windows
en.StartWithWindows=Open Pitlane HQ when Windows starts
de.StartWithWindows=Pitlane HQ beim Start von Windows öffnen
pt.StartWithWindows=Abrir o Pitlane HQ ao iniciar o Windows
es.StartGroup=Inicio:
en.StartGroup=Start:
de.StartGroup=Start:
pt.StartGroup=Início:
es.FullInstall=Completa: Pitlane HQ + plugin AZOM para volantes MOZA (recomendada)
en.FullInstall=Full: Pitlane HQ + AZOM plugin for MOZA wheels (recommended)
de.FullInstall=Vollständig: Pitlane HQ + AZOM-Plugin für MOZA-Lenkräder (empfohlen)
pt.FullInstall=Completa: Pitlane HQ + plugin AZOM para volantes MOZA (recomendada)
es.CompactInstall=Mínima: solo Pitlane HQ
en.CompactInstall=Minimal: Pitlane HQ only
de.CompactInstall=Minimal: nur Pitlane HQ
pt.CompactInstall=Mínima: só o Pitlane HQ
es.CustomInstall=Personalizada: elijo yo
en.CustomInstall=Custom: let me choose
de.CustomInstall=Benutzerdefiniert: selbst auswählen
pt.CustomInstall=Personalizada: eu escolho

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startup"; Description: "{cm:StartWithWindows}"; GroupDescription: "{cm:StartGroup}"; Flags: unchecked

[Files]
Source: "..\out\PitlaneHQ.exe"; DestDir: "{app}"; Components: app; Flags: ignoreversion
Source: "..\out\README.md"; DestDir: "{app}"; Components: app; Flags: ignoreversion
Source: "EULA.txt"; DestDir: "{app}"; Components: app; Flags: ignoreversion
Source: "..\docs\legal\PRIVACY.md"; DestDir: "{app}"; Components: app; Flags: ignoreversion
Source: "..\THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; Components: app; Flags: ignoreversion
Source: "..\out\MozaPlugin.dll"; DestDir: "{app}\azom"; Components: azom; Flags: ignoreversion
Source: "..\out\AZOM-LICENSE.txt"; DestDir: "{app}\azom"; Components: azom; Flags: ignoreversion
Source: "..\out\AZOM-README.md"; DestDir: "{app}\azom"; Components: azom; Flags: ignoreversion

[Icons]
Name: "{group}\Pitlane HQ"; Filename: "{app}\PitlaneHQ.exe"
Name: "{group}\{cm:UninstallProgram,Pitlane HQ}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\Pitlane HQ"; Filename: "{app}\PitlaneHQ.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PitlaneHQ"; ValueData: """{app}\PitlaneHQ.exe"""; Tasks: startup; Flags: uninsdeletevalue

[Run]
Filename: "{app}\PitlaneHQ.exe"; Description: "{cm:LaunchProgram,Pitlane HQ}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: files; Name: "{app}\*.old"

[Code]
procedure InitializeWizard();
begin
  WizardForm.Position := poScreenCenter;
end;

