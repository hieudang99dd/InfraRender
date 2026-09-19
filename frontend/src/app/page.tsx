"use client";

import Header from "@/components/layout/Header";
import RightPanel from "@/components/layout/RightPanel";
import WorkflowBar from "@/components/workspace/WorkflowBar";
import ImageCanvas from "@/components/workspace/ImageCanvas";
import PromptDock from "@/components/prompt/PromptDock";
import OutputHistory from "@/components/output/OutputHistory";
import RenderResult from "@/components/output/RenderResult";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useRenderService } from "@/hooks/useRenderService";
import LoginScreen from "@/components/layout/LoginScreen";
import { useEffect, useState } from "react";
import { apiRequest, getAccessToken, getBackendUrl } from "@/lib/api";

export default function Home() {
  const workspace = useWorkspace();
  const renderService = useRenderService();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    // Check initial auth status
    async function check() {
      if (!getAccessToken()) {
        setIsCheckingAuth(false);
        return;
      }
      try {
        await apiRequest("/api/auth/check");
        setIsAuthenticated(true);
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsCheckingAuth(false);
      }
    }
    void check();
  }, []);

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={() => {
      // Do not clear the workspace draft; let useProjectPersistence reconcile it.
      window.location.reload();
    }} isChecking={isCheckingAuth} />;
  }

  return (
    <div className="app">
      <a className="skip-link" href="#workspace">
        Đến không gian làm việc
      </a>

      <fieldset className="workspace-fieldset" disabled={!workspace.isLoaded}>
      <Header workspace={workspace} />
      
      <div className="app-shell">
        <main className="studio" id="workspace" tabIndex={-1}>
          <h1 className="sr-only">Không gian làm việc InfraRender</h1>

          <div className="studio-grid">
            <div className="comparison-column">
              <div className="comparison-heading">
                <h2>Đối chiếu hiện trạng & phối cảnh</h2>
                <p>Ảnh gốc và phối cảnh trong cùng một khung nhìn.</p>
              </div>
              <div className="comparison-grid" data-has-source={Boolean(workspace.source)}>
                <div className="comparison-pane" id="source">
                  <ImageCanvas
                    key={workspace.projectRevision}
                    sourceImage={workspace.source?.url || null}
                    sourceName={workspace.source?.name}
                    onImageChange={workspace.changeSource}
                    onImageRemove={() => workspace.changeSource(null)}
                  />
                </div>
                <div className="comparison-pane" id="render">
                  <RenderResult
                    result={workspace.renderedImage}
                    isRendering={workspace.isRendering}
                    onRemove={workspace.removeRenderedImage}
                    onDownload={() => void workspace.downloadImage()}
                    isDownloading={workspace.isDownloading}
                  />
                </div>
              </div>
            </div>

            <div className="settings-column" id="settings">
              <RightPanel
                key={workspace.projectRevision}
                settings={workspace.settings}
                onChange={workspace.setSettings}
                isGenerating={workspace.isGenerating}
                isRendering={workspace.isRendering}
                canGenerate={Boolean(workspace.source) && !workspace.isUploading}
              />
            </div>

            <div className="prompt-column" id="prompt">
              <PromptDock
                promptMode={workspace.promptMode}
                onPromptModeChange={workspace.setPromptMode}
                analysis={workspace.promptAnalysis}
                model={workspace.promptModel}
                prompt={workspace.prompt}
                onPromptChange={workspace.setPrompt}
                negativePrompt={workspace.negativePrompt}
                onNegativePromptChange={workspace.setNegativePrompt}
                notes={workspace.notes}
                onNotesChange={workspace.setNotes}
                onGenerate={workspace.generatePrompt}
                onSave={workspace.saveVersion}
                onClear={workspace.clearPrompt}
                isGenerating={workspace.isGenerating}
                isRendering={workspace.isRendering}
                canGenerate={Boolean(workspace.source && "saved_name" in workspace.source) && !workspace.isUploading}
                isStale={workspace.isStale}
                error={workspace.error}
                notice={workspace.notice}
              />
            </div>

            {(workspace.versions.length > 0 || workspace.renderVersions.length > 0) && (
              <div className="history-column" id="versions">
                <OutputHistory
                  versions={workspace.versions}
                  renderVersions={workspace.renderVersions}
                  activeVersion={workspace.activeVersion}
                  onRestore={workspace.restoreVersion}
                  onToggleFavorite={workspace.toggleFavorite}
                  onDelete={workspace.deleteVersion}
                  onDeleteRender={workspace.deleteRenderVersion}
                  onRestoreRender={workspace.restoreRenderVersion}
                  onDownloadRender={(version) => void workspace.downloadImage(version)}
                  activeRenderId={workspace.activeRenderId}
                />
              </div>
            )}

          </div>
        </main>
        
        <WorkflowBar
          hasSource={Boolean(workspace.source)}
          hasPrompt={Boolean(workspace.prompt.trim())}
          isGenerating={workspace.isGenerating}
          isRendering={workspace.isRendering}
          canGenerate={Boolean(workspace.source && "saved_name" in workspace.source) && !workspace.isUploading}
          canRender={Boolean(workspace.source && "saved_name" in workspace.source) && !workspace.isUploading && Boolean(workspace.prompt.trim()) && Boolean(renderService.service?.configured)}
          onGenerate={workspace.generatePrompt}
          onRender={workspace.renderImage}
        />
      </div>
      </fieldset>
    </div>
  );
}
