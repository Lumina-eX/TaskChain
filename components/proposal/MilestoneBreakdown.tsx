import React, { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

interface Milestone {
  id: string;
  title: string;
  description: string;
  amount: number;
  deadline: string;
}

interface MilestoneBreakdownProps {
  milestones: Milestone[];
  onChange: (milestones: Milestone[]) => void;
  error?: string;
}

const initialMilestone = (): Milestone => ({
  id: crypto.randomUUID(),
  title: '',
  description: '',
  amount: 0,
  deadline: '',
});

export const MilestoneBreakdown: React.FC<MilestoneBreakdownProps> = ({
  milestones,
  onChange,
  error,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const addMilestone = () => {
    onChange([...milestones, initialMilestone()]);
  };

  const removeMilestone = (id: string) => {
    onChange(milestones.filter((m) => m.id !== id));
  };

  const updateMilestone = (id: string, field: keyof Milestone, value: any) => {
    onChange(
      milestones.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
  };

  const totalAmount = milestones.reduce((sum, m) => sum + (m.amount || 0), 0);

  if (!isExpanded) {
    return (
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          <Plus size={16} />
          Add Milestone Breakdown (Optional)
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">
          Milestone Breakdown <span className="text-gray-500 text-sm font-normal">(Optional)</span>
        </h3>
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          <ChevronDown size={20} />
        </button>
      </div>

      {error && (
        <p className="text-red-500 text-sm mt-1">{error}</p>
      )}

      <div className="space-y-4">
        {milestones.map((milestone, index) => (
          <div
            key={milestone.id}
            className="p-4 border border-gray-200 rounded-lg bg-gray-50 relative group"
          >
            <button
              type="button"
              onClick={() => removeMilestone(milestone.id)}
              className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Remove milestone"
            >
              <Trash2 size={16} />
            </button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Milestone Title *
                </label>
                <input
                  type="text"
                  value={milestone.title}
                  onChange={(e) => updateMilestone(milestone.id, 'title', e.target.value)}
                  placeholder="e.g., Initial Design"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount ($) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={milestone.amount || ''}
                  onChange={(e) => updateMilestone(milestone.id, 'amount', parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={milestone.description}
                  onChange={(e) => updateMilestone(milestone.id, 'description', e.target.value)}
                  placeholder="Describe the deliverables for this milestone..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estimated Deadline *
                </label>
                <input
                  type="date"
                  value={milestone.deadline}
                  onChange={(e) => updateMilestone(milestone.id, 'deadline', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center pt-2">
        <button
          type="button"
          onClick={addMilestone}
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium"
        >
          <Plus size={16} />
          Add Another Milestone
        </button>
        
        {milestones.length > 0 && (
          <div className="text-sm font-medium text-gray-700">
            Total: ${totalAmount.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
};