# fedora + Macaulay2
FROM registry.fedoraproject.org/fedora-minimal:32
RUN microdnf -y install sudo openssh openssh-server graphviz lapack cddlib gc glpk gmp-c++ openblas-serial openblas-threads libnauty libatomic_ops givaro mathic mathicgb-libs memtailor procps && microdnf clean all
# have to manually do this cause no systemd
RUN ssh-keygen -t rsa -f /etc/ssh/ssh_host_rsa_key -N ''
RUN ssh-keygen -t dsa -f /etc/ssh/ssh_host_dsa_key -N '

# Macaulay2
COPY Macaulay2-1.15.1.0-1.x86_64.rpm .
RUN rpm -i Macaulay2-1.15.1.0-1.x86_64.rpm
RUN rm Macaulay2-1.15.1.0-1.x86_64.rpm

# M2 userland, part 1.    
RUN useradd -m -d /home/m2user m2user
#RUN mkdir /custom
#RUN chown -R m2user:m2user /usr/share/Macaulay2
#RUN chown -R m2user:m2user /custom
#RUN chmod -R 775 /custom

