import React from 'react';

// This data array makes the component "Reusable" as per requirements
const timelineEvents = [
  { id: 1, label: 'Escrow Created', status: 'completed', date: 'Oct 24, 2025' },
  { id: 2, label: 'Milestone Funded', status: 'completed', date: 'Oct 25, 2025' },
  { id: 3, label: 'Payment Released', status: 'current', date: 'In Progress' },
  { id: 4, label: 'Dispute Raised', status: 'upcoming', date: 'Pending' },
];

const ActivityTimeline = () => {
  return (
    <div className="p-6 bg-white rounded-lg shadow-md max-w-lg mx-auto">
      <h2 className="text-xl font-bold mb-6 text-gray-800">Contract Activity Timeline</h2>
      
      <div className="relative">
        {/* The Vertical Line */}
        <div className="absolute left-4 top-0 h-full w-0.5 bg-gray-200"></div>

        <div className="space-y-8">
          {timelineEvents.map((event) => (
            <div key={event.id} className="relative flex items-center ml-1">
              
              {/* Step Indicator Dot */}
              <div className={`z-10 w-7 h-7 rounded-full flex items-center justify-center border-2 
                ${event.status === 'completed' ? 'bg-green-500 border-green-500' : 
                  event.status === 'current' ? 'bg-white border-blue-500 animate-pulse' : 
                  'bg-white border-gray-300'}`}>
                
                {event.status === 'completed' && (
                  <span className="text-white text-xs">✓</span>
                )}
                {event.status === 'current' && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                )}
              </div>

              {/* Event Content */}
              <div className="ml-6">
                <p className={`font-semibold ${event.status === 'upcoming' ? 'text-gray-400' : 'text-gray-900'}`}>
                  {event.label}
                </p>
                <p className="text-xs text-gray-500 uppercase tracking-wide">
                  {event.date}
                </p>
              </div>

            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ActivityTimeline;