import React from 'react';
import { initials } from '../lib/format.js';

// A trimmed-down WhatsApp-style chat list. The prototype only has one
// conversation (the group), so the list simply highlights it.
export default function Sidebar({ group, onOpenMembers }) {
  const preview = `${group.members.length} members · tap to manage`;
  return (
    <aside className="sidebar">
      <header className="sidebar__header">
        <div className="avatar avatar--me">You</div>
        <span className="sidebar__title">Chats</span>
      </header>

      <div className="chatlist">
        <button className="chatlist__item chatlist__item--active" onClick={onOpenMembers}>
          <div className="avatar avatar--group">{initials(group.name)}</div>
          <div className="chatlist__meta">
            <span className="chatlist__name">{group.name}</span>
            <span className="chatlist__preview">{preview}</span>
          </div>
        </button>
      </div>
    </aside>
  );
}
