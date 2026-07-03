'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { FiCheck, FiMonitor } from 'react-icons/fi';
import useClickOutside from '@/hooks/useClickOutside';
import useEscapeKey from '@/hooks/useEscapeKey';

interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
  isScreen: boolean;
}

type SourceTab = 'screen' | 'window';

const OPEN_CHANNEL = 'screen-picker:open';
const RESULT_CHANNEL = 'screen-picker:result';
const ACCENT = '#8fb870';

const ScreenPickerModal = () => {
  const [sources, setSources] = useState<ScreenSource[] | null>(null);
  const [activeTab, setActiveTab] = useState<SourceTab>('screen');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;

    return window.electronAPI.on(OPEN_CHANNEL, (data) => {
      const list = data as ScreenSource[];
      const hasScreens = list.some((source) => source.isScreen);
      const tab: SourceTab = hasScreens ? 'screen' : 'window';

      setSources(list);
      setActiveTab(tab);
      setSelectedId(
        list.find((source) => source.isScreen === (tab === 'screen'))?.id ??
          null
      );
    });
  }, []);

  const respond = (id: string | null) => {
    window.electronAPI?.send(RESULT_CHANNEL, id);
    setSources(null);
    setSelectedId(null);
  };

  const handleClose = () => respond(null);

  const modalRef = useClickOutside<HTMLDivElement>(handleClose);
  useEscapeKey(handleClose);

  if (!sources) return null;

  const screens = sources.filter((source) => source.isScreen);
  const windows = sources.filter((source) => !source.isScreen);
  const visibleItems = activeTab === 'screen' ? screens : windows;

  const handleTabChange = (tab: SourceTab) => {
    setActiveTab(tab);
    const items = tab === 'screen' ? screens : windows;
    setSelectedId(items[0]?.id ?? null);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-9999999">
      <div
        ref={modalRef}
        className="w-[420px] max-h-[80vh] flex flex-col overflow-hidden bg-white"
        style={{
          borderRadius: 13,
          border: '1px solid rgba(255,255,255,0.85)',
          boxShadow:
            '0 2px 4px rgba(0,0,0,0.04), 0 8px 20px rgba(0,0,0,0.1), 0 20px 50px rgba(0,0,0,0.08)',
        }}
      >
        {/* Titlebar */}
        <div
          className="flex items-center px-3 flex-shrink-0"
          style={{
            height: 38,
            background: 'linear-gradient(180deg, #fafafa 0%, #f4f4f6 100%)',
            borderBottom: '1px solid rgba(0,0,0,0.07)',
          }}
        >
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center justify-center w-5 h-5 rounded-full hover:opacity-80 active:opacity-60 transition-opacity"
          >
            <span className="w-3 h-3 rounded-full bg-[#ff5f57] block" />
          </button>

          <div className="flex-1 flex items-center justify-center gap-1.5">
            <FiMonitor size={11} className="text-gray-400" />
            <span
              className="text-[11px] font-semibold text-gray-400"
              style={{ letterSpacing: '0.12em' }}
            >
              SCREEN SHARE
            </span>
          </div>

          <div className="w-5" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-3 pt-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => handleTabChange('screen')}
            disabled={screens.length === 0}
            className={`flex-1 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              activeTab === 'screen'
                ? 'text-white'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            style={
              activeTab === 'screen'
                ? { background: ACCENT, borderColor: ACCENT }
                : undefined
            }
          >
            화면
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('window')}
            disabled={windows.length === 0}
            className={`flex-1 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              activeTab === 'window'
                ? 'text-white'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            style={
              activeTab === 'window'
                ? { background: ACCENT, borderColor: ACCENT }
                : undefined
            }
          >
            창
          </button>
        </div>

        {/* Sources */}
        <div className="p-3 overflow-y-auto">
          {visibleItems.length === 0 ? (
            <p className="text-xs text-center py-8 text-gray-400">
              공유할 수 있는 항목이 없습니다.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {visibleItems.map((source) => {
                const selected = selectedId === source.id;
                return (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => setSelectedId(source.id)}
                    className="rounded-lg overflow-hidden text-left transition-colors"
                    style={{
                      border: selected
                        ? `2px solid ${ACCENT}`
                        : '1px solid rgba(0,0,0,0.08)',
                    }}
                  >
                    <div className="relative w-full aspect-video bg-gray-100">
                      <Image
                        src={source.thumbnail}
                        alt={source.name}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                      {selected && (
                        <div
                          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: ACCENT }}
                        >
                          <FiCheck size={12} className="text-white" />
                        </div>
                      )}
                    </div>
                    <div className="px-2 py-1.5 bg-white border-t border-gray-100">
                      <span className="text-[11px] text-gray-600 truncate block">
                        {source.name}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2.5 border-t border-gray-100 flex justify-end shrink-0">
          <button
            type="button"
            onClick={() => respond(selectedId)}
            disabled={!selectedId}
            className="flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-full font-medium text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: ACCENT }}
          >
            <FiMonitor size={11} />
            공유하기
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScreenPickerModal;
