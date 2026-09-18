"use client";

import Header from "@/components/layout/Header";
import RightPanel from "@/components/layout/RightPanel";
import ImageCanvas from "@/components/workspace/ImageCanvas";
import PromptDock from "@/components/prompt/PromptDock";
import OutputHistory from "@/components/output/OutputHistory";
import RenderResult from "@/components/output/RenderResult";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function Home() {
  const workspace = useWorkspace();

  return (
    <div className="app">
      <a className="skip-link" href="#workspace">
        Đến không gian làm việc
      </a>

      <Header
        projectName={workspace.projectName}
        onProjectNameChange={workspace.setProjectName}
        onRefresh={workspace.resetProject}
        onExport={workspace.exportPrompt}
        canExport={Boolean(workspace.prompt.trim())}
      />

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
                    onDownload={workspace.downloadImage}
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
                canGenerate={Boolean(workspace.source)}
              />
            </div>

            <div className="prompt-column" id="prompt">
              <PromptDock
                prompt={workspace.prompt}
                onPromptChange={workspace.setPrompt}
                negativePrompt={workspace.negativePrompt}
                onNegativePromptChange={workspace.setNegativePrompt}
                notes={workspace.notes}
                onNotesChange={workspace.setNotes}
                onGenerate={workspace.generatePrompt}
                onSave={workspace.saveVersion}
                onClear={workspace.clearPrompt}
                onRender={workspace.renderImage}
                isGenerating={workspace.isGenerating}
                isRendering={workspace.isRendering}
                canGenerate={Boolean(workspace.source)}
                isStale={workspace.isStale}
                error={workspace.error}
                notice={workspace.notice}
              />
            </div>

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
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
