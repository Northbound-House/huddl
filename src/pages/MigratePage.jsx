import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const STORAGE_KEY = 'huddle-board-app-v1';

/**
 * Migration page for importing Firebase export data into localStorage.
 * Accessible at /migrate on the Netlify (Jack Henry) deployment.
 */
export function MigratePage() {
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);
  const [stats, setStats] = useState(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setStats(null);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate structure
      const requiredKeys = ['boards', 'columns', 'cards', 'teams', 'organizations'];
      const missingKeys = requiredKeys.filter((k) => !Array.isArray(data[k]));

      if (missingKeys.length > 0) {
        throw new Error(`Invalid export file. Missing keys: ${missingKeys.join(', ')}`);
      }

      // Check if localStorage already has data
      const existing = localStorage.getItem(STORAGE_KEY);
      if (existing) {
        const confirm = window.confirm(
          '⚠️ WARNING: You already have data in this browser.\n\n' +
            'Importing will REPLACE all existing data.\n\n' +
            'Click OK to proceed or Cancel to abort.'
        );
        if (!confirm) {
          setImporting(false);
          return;
        }
      }

      // Ensure all required arrays exist
      const complete = {
        boards: data.boards || [],
        columns: data.columns || [],
        cards: data.cards || [],
        teams: data.teams || [],
        team_memberships: data.team_memberships || [],
        organizations: data.organizations || [],
        organization_memberships: data.organization_memberships || [],
        retrospective_sessions: data.retrospective_sessions || [],
        public_profiles: data.public_profiles || [],
        board_labels: data.board_labels || [],
        product_feedback: data.product_feedback || [],
      };

      // Save to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(complete));

      setStats({
        boards: complete.boards.length,
        cards: complete.cards.length,
        teams: complete.teams.length,
        organizations: complete.organizations.length,
        retrospective_sessions: complete.retrospective_sessions.length,
      });

      toast.success('Data imported successfully!');
    } catch (error) {
      console.error('Import failed:', error);
      toast.error(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleClearData = () => {
    const confirm = window.confirm(
      '⚠️ WARNING: This will DELETE ALL data from this browser.\n\n' +
        'This action cannot be undone.\n\n' +
        'Click OK to proceed or Cancel to abort.'
    );

    if (!confirm) return;

    const doubleConfirm = window.prompt(
      'Type "DELETE" (all caps) to confirm deletion:'
    );

    if (doubleConfirm !== 'DELETE') {
      toast.error('Deletion cancelled');
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    setStats(null);
    toast.success('All data cleared');
  };

  const handleExportData = () => {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      toast.error('No data to export');
      return;
    }

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `huddl-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Data exported');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Data Migration
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Import your data from Firebase to this browser's local storage
        </p>

        {/* Import Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Import Data
          </h2>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="file-upload"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Select export file (JSON)
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".json,application/json"
                onChange={handleFileUpload}
                disabled={importing}
                className="block w-full text-sm text-gray-900 dark:text-gray-100
                         border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer
                         bg-gray-50 dark:bg-gray-700 focus:outline-none
                         file:mr-4 file:py-2 file:px-4
                         file:rounded-lg file:border-0
                         file:text-sm file:font-semibold
                         file:bg-blue-50 file:text-blue-700
                         dark:file:bg-blue-900 dark:file:text-blue-200
                         hover:file:bg-blue-100 dark:hover:file:bg-blue-800"
              />
            </div>

            {importing && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Importing data...
              </div>
            )}

            {stats && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-2">
                  ✅ Import Successful
                </h3>
                <ul className="text-sm text-green-800 dark:text-green-200 space-y-1">
                  <li>Organizations: {stats.organizations}</li>
                  <li>Teams: {stats.teams}</li>
                  <li>Boards: {stats.boards}</li>
                  <li>Cards: {stats.cards}</li>
                  <li>Retrospective Sessions: {stats.retrospective_sessions}</li>
                </ul>
                <button
                  onClick={() => navigate('/')}
                  className="mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
                >
                  Go to Dashboard →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Export Section */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Export Data
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Download your current data as a JSON backup
          </p>
          <button
            onClick={handleExportData}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            Export Data
          </button>
        </div>

        {/* Danger Zone */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border-2 border-red-200 dark:border-red-900 p-6">
          <h2 className="text-xl font-semibold text-red-900 dark:text-red-100 mb-4">
            Danger Zone
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Permanently delete all data from this browser. This cannot be undone.
          </p>
          <button
            onClick={handleClearData}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
          >
            Clear All Data
          </button>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
            📋 Migration Instructions
          </h3>
          <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-2 list-decimal list-inside">
            <li>Obtain the export file (<code>export-jackhenry-combined-YYYY-MM-DD.json</code>)</li>
            <li>Click "Choose File" and select the JSON export</li>
            <li>Wait for import to complete</li>
            <li>Click "Go to Dashboard" to verify your data</li>
          </ol>

          <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>Note:</strong> Data is stored in your browser only. Each user must import
              their own data. To access data on multiple computers, export and import on each device.
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
