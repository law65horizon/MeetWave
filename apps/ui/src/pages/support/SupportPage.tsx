import { useState } from 'react';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  TextField, 
  Button, 
  Grid, 
  Accordion, 
  AccordionSummary, 
  AccordionDetails,
  Divider,
  Paper,
  InputAdornment,
  IconButton
} from '@mui/material';
import { Search, ChevronDown, MessageCircle, PlayCircle, FileText, Send } from 'lucide-react';

const SupportPage = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<string | false>(false);
  
  const handleAccordionChange = (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };
  
  // FAQ data
  const faqs = [
    {
      id: 'faq1',
      question: 'How do I start a meeting?',
      answer: 'To start a meeting, go to the "Start a Meeting" page or click on the "Start New Meeting" button on the home page. You can choose to start an instant meeting using your personal meeting room or schedule a meeting for later.'
    },
    {
      id: 'faq2',
      question: 'How do I invite participants to my meeting?',
      answer: 'You can invite participants to your meeting by sharing your meeting link or by adding their emails when scheduling a meeting. Participants will receive an email with the meeting details and a link to join.'
    },
    {
      id: 'faq3',
      question: 'How do I share my screen during a meeting?',
      answer: 'During a meeting, click on the "Share Screen" button in the meeting controls at the bottom of the screen. You can choose to share your entire screen, a specific application window, or a browser tab.'
    },
    {
      id: 'faq4',
      question: 'How do I change my audio and video settings?',
      answer: 'You can change your audio and video settings by going to the Settings page and selecting the "Audio & Video" tab. Here you can select your preferred microphone, speaker, and camera, as well as adjust other audio and video settings.'
    },
    {
      id: 'faq5',
      question: 'How do I record a meeting?',
      answer: 'To record a meeting, click on the "More" (three dots) button in the meeting controls and select "Record Meeting". You can pause or stop the recording at any time using the same menu. Recordings will be saved to your account and can be accessed later.'
    },
    {
      id: 'faq6',
      question: 'How do I use a virtual background?',
      answer: 'To use a virtual background, go to the Settings page and select the "Background" tab. Here you can choose from the available background options or upload your own image. You can also enable background blur or other effects.'
    }
  ];
  
  // Helper articles
  const helpArticles = [
    {
      title: 'Getting Started with MeetApp',
      description: 'Learn the basics of using MeetApp for video conferencing and meetings.',
      icon: <PlayCircle size={24} />
    },
    {
      title: 'Advanced Meeting Controls',
      description: 'Take your meetings to the next level with advanced controls and features.',
      icon: <FileText size={24} />
    },
    {
      title: 'Troubleshooting Audio and Video Issues',
      description: 'Fix common audio and video problems during meetings.',
      icon: <MessageCircle size={24} />
    },
    {
      title: 'Privacy and Security Guide',
      description: 'Learn how to secure your meetings and protect your privacy.',
      icon: <FileText size={24} />
    }
  ];
  
  const filteredFaqs = searchQuery 
    ? faqs.filter(faq => 
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) || 
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : faqs;

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Help & Support
      </Typography>
      
      {/* Search box */}
      <Card sx={{ mb: 4 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
          <Typography variant="h5" gutterBottom align="center">
            How can we help you today?
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }} align="center">
            Search our knowledge base or browse frequently asked questions
          </Typography>
          
          <TextField
            fullWidth
            placeholder="Search for answers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
            sx={{ maxWidth: 600 }}
          />
        </CardContent>
      </Card>
      
      <Grid container spacing={4}>
        {/* FAQ Section */}
        <Grid item xs={12} md={8}>
          <Typography variant="h5" gutterBottom>
            Frequently Asked Questions
          </Typography>
          
          <Card>
            <CardContent sx={{ p: 0 }}>
              {filteredFaqs.length > 0 ? (
                filteredFaqs.map((faq, index) => (
                  <Box key={faq.id}>
                    <Accordion
                      expanded={expanded === faq.id}
                      onChange={handleAccordionChange(faq.id)}
                      elevation={0}
                    >
                      <AccordionSummary
                        expandIcon={<ChevronDown />}
                        sx={{ 
                          px: 3, 
                          py: 1.5,
                          '&.Mui-expanded': {
                            borderBottom: '1px solid',
                            borderColor: 'divider'
                          }
                        }}
                      >
                        <Typography variant="subtitle1" fontWeight={500}>
                          {faq.question}
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails sx={{ px: 3, py: 2 }}>
                        <Typography variant="body1">
                          {faq.answer}
                        </Typography>
                      </AccordionDetails>
                    </Accordion>
                    {index < filteredFaqs.length - 1 && !expanded && <Divider />}
                  </Box>
                ))
              ) : (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body1" color="text.secondary">
                    No results found for "{searchQuery}". Try a different search term or browse our help center.
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        
        {/* Help Center & Contact Section */}
        <Grid item xs={12} md={4}>
          {/* Help Articles */}
          <Typography variant="h5" gutterBottom>
            Help Articles
          </Typography>
          
          <Stack spacing={2} sx={{ mb: 4 }}>
            {helpArticles.map((article, index) => (
              <Paper
                key={index}
                variant="outlined"
                sx={{ 
                  p: 2, 
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                    cursor: 'pointer'
                  }
                }}
              >
                <Box sx={{ display: 'flex' }}>
                  <Box sx={{ mr: 2, color: 'primary.main' }}>
                    {article.icon}
                  </Box>
                  <Box>
                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 500 }}>
                      {article.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {article.description}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            ))}
          </Stack>
          
          {/* Contact Support */}
          <Typography variant="h5" gutterBottom>
            Contact Support
          </Typography>
          
          <Card>
            <CardContent>
              <Typography variant="body1" paragraph>
                Can't find what you're looking for? Our support team is here to help.
              </Typography>
              
              <TextField
                label="Subject"
                fullWidth
                sx={{ mb: 2 }}
              />
              
              <TextField
                label="Message"
                fullWidth
                multiline
                rows={4}
                sx={{ mb: 2 }}
              />
              
              <Button
                variant="contained"
                fullWidth
                startIcon={<Send size={18} />}
              >
                Send Message
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

// TypeScript doesn't know about the Stack component
const Stack = ({ children, spacing, sx }: { children: React.ReactNode, spacing: number, sx?: any }) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: spacing, ...sx }}>
      {children}
    </Box>
  );
};

export default SupportPage;