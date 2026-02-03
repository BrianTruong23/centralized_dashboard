
import { ideasDb } from '@/lib/ideas';
import { supabase } from '@/lib/supabase';

// Mock the supabase client
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        order: jest.fn().mockResolvedValue({ data: [], error: null }),
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({ 
            data: { 
              id: '123', 
              user_id: 'user-1', 
              title: 'Test', 
              description: 'Desc', 
              status: 'backlog', 
              created_at: new Date().toISOString() 
            }, 
            error: null 
          }),
        })),
      })),
    })),
  },
}));

describe('ideasDb', () => {
  it('fetchIdeas calls supabase correctly', async () => {
    // Setup mock return
    const mockData = [{ id: '1', title: 'Idea 1', created_at: '2023-01-01T00:00:00Z' }];
    (supabase.from as jest.Mock).mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: mockData, error: null })
      }),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({ 
            data: { id: '123', title: 'Test', status: 'backlog', created_at: new Date().toISOString() }, 
            error: null 
          })
        }))
      }))
    }));

    const result = await ideasDb.fetchIdeas();
    expect(supabase.from).toHaveBeenCalledWith('ideas');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Idea 1');
  });

  it('addIdea calls supabase insert', async () => {
    const newIdea = { title: 'New', description: 'Desc', status: 'backlog' as const, user_id: 'u1' };
    
    // We mocked the return in the factory, but we can refine it here if needed
    const result = await ideasDb.addIdea(newIdea);
    
    expect(supabase.from).toHaveBeenCalledWith('ideas');
    expect(result.title).toBe('Test'); // Matches factory mock
  });
});
