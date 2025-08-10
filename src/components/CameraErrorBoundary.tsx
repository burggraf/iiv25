import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'

interface CameraErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

interface CameraErrorBoundaryProps {
  children: React.ReactNode
  fallbackMessage?: string
  onRetry?: () => void
  onCancel?: () => void
}

export class CameraErrorBoundary extends React.Component<
  CameraErrorBoundaryProps,
  CameraErrorBoundaryState
> {
  constructor(props: CameraErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): CameraErrorBoundaryState {
    console.error('Camera Error Boundary caught error:', error)
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Camera Error Boundary details:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
    this.props.onRetry?.()
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <View style={styles.errorContent}>
            <Text style={styles.errorTitle}>📷 Camera Error</Text>
            <Text style={styles.errorMessage}>
              {this.props.fallbackMessage || 
               'Camera encountered an error. This might be due to hardware conflicts or permissions.'}
            </Text>
            
            {this.state.error && (
              <Text style={styles.errorDetails}>
                {this.state.error.message}
              </Text>
            )}
            
            <View style={styles.buttonContainer}>
              {this.props.onCancel && (
                <TouchableOpacity 
                  style={styles.cancelButton} 
                  onPress={this.props.onCancel}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity 
                style={styles.retryButton} 
                onPress={this.handleRetry}
              >
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )
    }

    return this.props.children
  }
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    maxWidth: 320,
    width: '100%',
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  errorDetails: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  retryButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
})