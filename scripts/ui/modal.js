// /scripts/ui/modal.js

import { logInfo, logError } from '../utils/logger.js';

class ModalManager {
  constructor() {
    this.modals = new Map();
    document.addEventListener('click', this.handleDocumentClick.bind(this));
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
  }

  registerModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
      logError(`Modal with id "${modalId}" not found.`);
      return;
    }
    this.modals.set(modalId, modal);

    // Close buttons inside modal
    const closeBtns = modal.querySelectorAll('.close-modal');
    closeBtns.forEach(btn => {
      btn.addEventListener('click', () => this.closeModal(modalId));
    });

    // Click outside to close
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        this.closeModal(modalId);
      }
    });

    logInfo(`Modal "${modalId}" registered.`);
  }

  openModal(modalId) {
    const modal = this.modals.get(modalId);
    if (!modal) {
      logError(`Modal with id "${modalId}" is not registered.`);
      return;
    }
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    logInfo(`Modal "${modalId}" opened.`);
  }

  closeModal(modalId) {
    const modal = this.modals.get(modalId);
    if (!modal) {
      logError(`Modal with id "${modalId}" is not registered.`);
      return;
    }
    modal.classList.remove('active');
    document.body.style.overflow = '';
    logInfo(`Modal "${modalId}" closed.`);
  }

  handleDocumentClick(event) {
    // Optional: implement global triggers if needed
    // e.g. data-modal-open attribute on buttons to open modals
  }

  handleKeyDown(event) {
    if (event.key === 'Escape') {
      // Close all modals
      this.modals.forEach((modal, id) => {
        if (modal.classList.contains('active')) {
          this.closeModal(id);
        }
      });
    }
  }
}

const modalManager = new ModalManager();
export default modalManager;
