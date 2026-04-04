// ============================================================
// Chat Page — conversation list + message panel
// ============================================================

import { useEffect, useState, useRef } from 'react';
import { Send, MessageSquare, Bot, User } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useAgentStore } from '../stores/agentStore';

export default function Chat() {
  const {
    conversations,
    currentConversationId,
    currentMessages,
    loading,
    sending,
    fetchConversations,
    fetchMessages,
    sendMessage,
    setCurrentConversation,
  } = useChatStore();
  const { agents, fetchAgents } = useAgentStore();
  const [inputText, setInputText] = useState('');
  const [targetAgentId, setTargetAgentId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations();
    fetchAgents();
  }, [fetchConversations, fetchAgents]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages]);

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;
    const msg = inputText.trim();
    setInputText('');
    await sendMessage({
      message: msg,
      agentId: targetAgentId || undefined,
      conversationId: currentConversationId || undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectConversation = (id: string) => {
    setCurrentConversation(id);
    fetchMessages(id);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Left: Conversation List */}
      <div className="w-72 flex-shrink-0 flex flex-col bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
            Conversations
          </h3>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-1">
          {/* New conversation button */}
          <button
            onClick={() => {
              setCurrentConversation(null);
            }}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
              !currentConversationId
                ? 'bg-blue-600/20 text-blue-400'
                : 'text-gray-400 hover:bg-gray-700/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              <span>New Conversation</span>
            </div>
          </button>

          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => handleSelectConversation(conv.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                currentConversationId === conv.id
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:bg-gray-700/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="truncate">
                    {conv.agentId
                      ? agents.find((a) => a.id === conv.agentId)?.name ?? 'Agent'
                      : 'Orchestrator'}
                  </p>
                  <p className="text-xs text-gray-600">
                    {new Date(conv.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </button>
          ))}

          {conversations.length === 0 && !loading && (
            <p className="text-center text-gray-600 text-xs py-4">No conversations yet</p>
          )}
        </div>
      </div>

      {/* Right: Chat Messages */}
      <div className="flex-1 flex flex-col bg-gray-800 rounded-lg border border-gray-700">
        {/* Target selector */}
        <div className="p-3 border-b border-gray-700 flex items-center gap-3">
          <label className="text-sm text-gray-500">Talk to:</label>
          <select
            value={targetAgentId}
            onChange={(e) => setTargetAgentId(e.target.value)}
            className="input text-sm py-1"
          >
            <option value="">Orchestrator (CEO)</option>
            {agents
              .filter((a) => a.status === 'active')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role})
                </option>
              ))}
          </select>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {currentMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role !== 'user' && (
                <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-blue-400" />
                </div>
              )}
              <div
                className={`max-w-[70%] rounded-xl px-4 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-200'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p className="text-xs opacity-50 mt-1">
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </p>
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-gray-300" />
                </div>
              )}
            </div>
          ))}
          {currentMessages.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
              Start a conversation...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-gray-700">
          <div className="flex items-end gap-2">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
              rows={2}
              className="input flex-1 resize-none"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || sending}
              className="btn-primary px-3 py-2.5 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          {sending && <p className="text-xs text-gray-500 mt-1">Sending...</p>}
        </div>
      </div>
    </div>
  );
}
